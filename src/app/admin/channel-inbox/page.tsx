import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { canSeeSplit, currentProfile, currentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import { sourceColor, sourceLabel } from "@/lib/block-sources";
import { addDaysISO, formatDayMonth, todayISO } from "@/lib/calendar";
import { listUnavailable } from "@/lib/availability";
import { pkrRate, toPkr, type FxRate } from "@/lib/fx";
import {
  KIND_LABEL,
  STATUS_LABEL,
  OPEN_STATUSES,
  statusTone,
  blockers,
  matchReservation,
  channelReservationUrl,
  type ImportedHold,
  type InboxMatch,
  type InboxUnit,
  type OtaMessageKind,
  type OtaMessageStatus,
  type ParsedReservation,
} from "@/lib/ota";
import {
  fieldLabel,
  fieldInput,
  primaryButton,
  secondaryButton,
  errorBanner,
  noticeBanner,
} from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import {
  approveReservation,
  applyCancellation,
  applyAlteration,
  confirmRequest,
  reconvertBookings,
  keepBookingRate,
  dismissMessage,
  markHandled,
} from "./actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { NotificationSettings } from "@/components/shared/NotificationSettings";
import { readNotificationPreferences } from "@/lib/notification-feed";
import { loadSettings } from "@/lib/settings";

/**
 * What the channels have emailed in, and what to do about it.
 *
 * Everything here is a *proposal*. A reservation becomes a booking only when an
 * admin submits the form on its card, which goes through the ordinary booking
 * write — same payout math, same clash check, same notification to the owner.
 * Until then the owner has been told nothing, which is deliberate: a mis-read
 * email must not be able to announce a stay that is not happening.
 */

type MessageRow = {
  id: string;
  subject: string | null;
  from_email: string | null;
  received_at: string;
  source: string | null;
  kind: OtaMessageKind;
  status: OtaMessageStatus;
  parse_error: string | null;
  parsed: ParsedReservation | null;
  external_ref: string | null;
  property_id: string | null;
  booking_id: string | null;
  booking_match: "code" | "guest_dates" | null;
  admin_note: string | null;
  raw_text: string | null;
  properties: { name: string; clients: { name: string } | null } | null;
};

type PropertyRow = {
  id: string;
  name: string;
  airbnb_listing_id: string | null;
  booking_hotel_id: string | null;
  booking_room_type: string | null;
  clients: { name: string } | null;
};

function ago(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * How long a mail has sat unreviewed. Past an hour it stops being "2m ago"
 * and becomes a warning, because a channel booking nobody has written up is
 * a guest nobody is expecting.
 */
function waiting(since: string): { text: string; late: boolean } {
  const late = Date.now() - new Date(since).getTime() >= 3_600_000;
  return { text: late ? `waiting ${ago(since).replace(/ ago$/, "")}` : ago(since), late };
}

function Chip({ status }: { status: OtaMessageStatus }) {
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full border"
      style={{ color: statusTone(status), borderColor: statusTone(status) }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function Channel({ source }: { source: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-secondary">
      <span
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: sourceColor(source) }}
        aria-hidden
      />
      {sourceLabel(source) ?? "Unknown channel"}
    </span>
  );
}

/** A read-only fact from the email, shown next to the field it filled in. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-ink-muted">{label}</span>
      <span className="text-sm text-ink-primary">{value}</span>
    </div>
  );
}

type FxDueRow = {
  id: string;
  guest_name: string | null;
  check_in: string;
  original_currency: string;
  original_amount: number | string;
  fx_rate: number | string | null;
  fx_rate_on: string | null;
  sale_price: number | string | null;
  settled: boolean | null;
  share_received: boolean | null;
};

type BookingRow = {
  id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  status: string;
  sale_price: number | string | null;
  booking_properties: { properties: { name: string } | null }[] | null;
};

type BookingSummary = {
  id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  status: string;
  sale_price: number | null;
  units: string;
};

/** The booking a cancellation or change is about, as it stands here. */
function BookingFacts({ booking }: { booking: BookingSummary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <Fact label="Guest" value={booking.guest_name ?? "—"} />
      <Fact label="Booked here" value={nights(booking.check_in, booking.check_out)} />
      <Fact label="Unit" value={booking.units || "—"} />
      <div className="col-span-2 sm:col-span-3 text-xs">
        <Link href={`/admin/bookings/${booking.id}`} className="text-hostello-gold hover:underline">
          Open the booking
        </Link>
        {booking.status === "cancelled" && (
          <span className="text-ink-muted"> · already cancelled</span>
        )}
      </div>
    </div>
  );
}

/** A booking found without the channel's code is a weaker match, and says so. */
function MatchNote({ row }: { row: MessageRow }) {
  if (row.booking_match !== "guest_dates") return null;
  return (
    <p className="text-xs text-status-pending">
      Matched by guest, dates and unit — this booking has no {sourceLabel(row.source)} code on
      it. Check it is the same stay.
    </p>
  );
}

/**
 * The channel's figure in rupees, and the hidden fields that let the booking
 * remember what it was converted from (see src/lib/fx.ts). Renders nothing for
 * a PKR figure.
 */
function Conversion({
  amount,
  currency,
  rate,
}: {
  amount: number | null | undefined;
  currency: string | null | undefined;
  rate: FxRate | null | undefined;
}) {
  if (amount === null || amount === undefined || !currency || currency === "PKR") return null;
  if (!rate) {
    return (
      <p className={errorBanner}>
        The channel quoted {money(amount, currency)}, and today&apos;s {currency} rate could not be
        fetched. Type the rupee amount yourself.
      </p>
    );
  }
  return (
    <>
      <input type="hidden" name="original_currency" value={currency} />
      <input type="hidden" name="original_amount" value={amount} />
      <input type="hidden" name="fx_rate_on" value={rate.asOf} />
      <p className="text-xs text-ink-muted">
        {money(amount, currency)} × {rate.pkrPerUnit.toFixed(2)} (market rate, {formatDayMonth(rate.asOf)}) ={" "}
        <span className="text-ink-primary">{formatPKR(toPkr(amount, rate))}</span>. Provisional until
        check-in, when it can be re-converted at that day&apos;s rate. Airbnb pays out at its own rate, so
        this is an estimate of what arrives.
      </p>
    </>
  );
}

/**
 * Gmail asks the receiving address to confirm a forwarding filter before it
 * forwards anything. The request lands here like any other mail; this pulls
 * out who asked and the link that says yes.
 */
function gmailForwarding(row: MessageRow): { requester: string | null; link: string | null; code: string | null } | null {
  const fromGoogle = /forwarding-noreply@google\.com/i.test(row.from_email ?? "");
  if (!fromGoogle && !/gmail forwarding confirmation/i.test(row.subject ?? "")) return null;
  const text = row.raw_text ?? "";
  return {
    requester:
      (row.subject ?? "").match(/receive mail from\s+(\S+@\S+)/i)?.[1] ??
      text.match(/(\S+@\S+)\s+has requested to automatically forward/i)?.[1] ??
      null,
    link: text.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/[^\s"<>]+/i)?.[0] ?? null,
    code: text.match(/confirmation code:\s*(\d+)/i)?.[1] ?? null,
  };
}

/** A channel figure in the currency the channel quoted it in. */
function money(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  if (!currency || currency === "PKR") return formatPKR(amount);
  return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function nights(from: string, toExclusive: string): string {
  return `${formatDayMonth(from)} → ${formatDayMonth(toExclusive)}`;
}

/**
 * What the channel's own calendar says about this stay, in one line. The mail
 * and the iCal are two reports of one reservation; when they agree the reviewer
 * can approve on sight, and when they do not this is where it shows.
 */
function CalendarLine({ row, match }: { row: MessageRow; match: InboxMatch }) {
  const channel = sourceLabel(row.source) ?? "channel";
  const unit = match.units.find((u) => u.id === match.hold?.property_id)?.name;
  const hold = match.hold;

  if (match.check === "agrees" && hold) {
    return (
      <p className="text-xs text-status-available">
        ✓ The {channel} calendar shows this stay on {unit} (
        {nights(hold.start_date, addDaysISO(hold.end_date, 1))}). Approving writes up that
        reservation.
      </p>
    );
  }
  if (match.check === "differs" && hold) {
    return (
      <p className={errorBanner}>
        The {channel} calendar shows {unit} held {nights(hold.start_date, addDaysISO(hold.end_date, 1))},
        not the dates in this email. Check the reservation before approving.
      </p>
    );
  }
  if (match.check === "missing") {
    return (
      <p className="text-xs text-ink-muted">
        The {channel} calendar doesn&apos;t show this stay yet. It syncs every minute — if it
        still doesn&apos;t after that, check the listing before approving.
      </p>
    );
  }
  return (
    <p className="text-xs text-ink-muted">
      {row.source === "booking_com" && !match.checkOut
        ? "No Booking.com calendar shows a stay starting that day, so the departure has to come from the reservation."
        : `No ${channel} calendar is connected for this unit, so there is nothing to check these dates against.`}
    </p>
  );
}

export default async function ChannelInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;

  const supabase = await createClient();
  const [user, profile] = await Promise.all([currentUser(), currentProfile()]);
  if (!user) redirect("/login");

  const [{ data: messages }, { data: props }] = await Promise.all([
    supabase
      .from("ota_messages")
      .select(
        "id, subject, from_email, received_at, source, kind, status, parse_error, parsed, external_ref, property_id, booking_id, booking_match, admin_note, raw_text, properties:properties_v(name, clients:clients_v(name))"
      )
      .order("received_at", { ascending: false })
      .limit(60),
    supabase
      .from("properties_v")
      .select("id, name, airbnb_listing_id, booking_hotel_id, booking_room_type, clients:clients_v(name)")
      .eq("bookable", true)
      .order("name"),
  ]);

  // A payout mail is the channel saying what it paid Hostello, and it is worked
  // on "Owed to Hostello" — both the owner's. Ops never sees that queue.
  const showMoney = canSeeSplit(profile?.role);
  // Push is switched on from Activity, which is owner-only; an ops login needs
  // somewhere to do it, and this is the page its alerts are about.
  const [opsPreferences, settings] = await Promise.all([
    showMoney ? null : readNotificationPreferences(user.id),
    loadSettings(),
  ]);
  const rows = ((messages ?? []) as unknown as MessageRow[]).filter(
    (r) => showMoney || r.kind !== "payout"
  );
  const units: InboxUnit[] = ((props ?? []) as unknown as PropertyRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    clientName: p.clients?.name ?? null,
    airbnb_listing_id: p.airbnb_listing_id,
    booking_hotel_id: p.booking_hotel_id,
    booking_room_type: p.booking_room_type,
  }));

  const open = rows.filter((r) => OPEN_STATUSES.includes(r.status));
  const closed = rows.filter((r) => !OPEN_STATUSES.includes(r.status));

  // What the channels' calendars already show, to hold each new reservation up
  // against: imported holds nobody has written up, which units have a calendar
  // connected, and every occupied night from the earliest arrival on.
  const reservations = open.filter((r) => r.kind === "new_booking");
  const earliest = reservations
    .map((r) => r.parsed?.check_in)
    .filter((d): d is string => Boolean(d))
    .sort()[0];
  const from = earliest && earliest < todayISO() ? earliest : todayISO();
  const unitIds = units.map((u) => u.id);

  // …and, for cancellations and changes, the booking each names and the hold
  // the calendar keeps for it — which is how the card knows whether the
  // calendar has freed or moved the stay too.
  const bookingIds = [...new Set(open.map((r) => r.booking_id).filter((b): b is string => Boolean(b)))];

  const [holdsRes, feedsRes, busy, bookingsRes, linkedRes, unexplainedRes, fxDueRes] = await Promise.all([
    reservations.length > 0
      ? supabase
          .from("calendar_blocks")
          .select("id, property_id, start_date, end_date, source")
          .not("feed_id", "is", null)
          .is("booking_id", null)
          .gte("end_date", from)
      : Promise.resolve({ data: [] }),
    reservations.length > 0
      ? supabase.from("calendar_feeds").select("property_id, source").eq("active", true)
      : Promise.resolve({ data: [] }),
    reservations.length > 0 ? listUnavailable(supabase, unitIds, { from }) : Promise.resolve([]),
    bookingIds.length > 0
      ? supabase
          .from("bookings_v")
          .select("id, guest_name, check_in, check_out, status, sale_price, booking_properties(properties:properties_v(name))")
          .in("id", bookingIds)
      : Promise.resolve({ data: [] }),
    bookingIds.length > 0
      ? supabase
          .from("calendar_blocks")
          .select("id, booking_id, property_id, start_date, end_date, source")
          .not("feed_id", "is", null)
          .in("booking_id", bookingIds)
      : Promise.resolve({ data: [] }),
    supabase.rpc("unexplained_channel_holds", { p_min_age: "1 hour" }),
    // Converted prices due to be worked out again now the guest has arrived.
    // Admin only: it moves a price, and the settlement state decides it.
    showMoney
      ? supabase
          .from("bookings_v")
          .select("id, guest_name, check_in, original_currency, original_amount, fx_rate, fx_rate_on, sale_price, settled, share_received")
          .eq("fx_provisional", true)
          .neq("status", "cancelled")
          .lte("check_in", todayISO())
          .order("check_in")
      : Promise.resolve({ data: [] }),
  ]);

  const holds = (holdsRes.data ?? []) as ImportedHold[];
  const feeds = (feedsRes.data ?? []) as { property_id: string; source: string }[];
  const bookings = new Map(
    ((bookingsRes.data ?? []) as unknown as BookingRow[]).map((b) => [
      b.id,
      {
        id: b.id,
        guest_name: b.guest_name,
        check_in: b.check_in,
        check_out: b.check_out,
        status: b.status,
        sale_price: b.sale_price === null ? null : Number(b.sale_price),
        units: (b.booking_properties ?? []).map((bp) => bp.properties?.name).filter(Boolean).join(", "),
      } satisfies BookingSummary,
    ])
  );
  const linkedHolds = new Map(
    ((linkedRes.data ?? []) as (ImportedHold & { booking_id: string })[]).map((h) => [h.booking_id, h])
  );
  const unexplained = (unexplainedRes.data ?? []) as (ImportedHold & { created_at: string })[];
  const unitName = new Map(units.map((u) => [u.id, u.name]));

  const fxDue = (fxDueRes.data ?? []) as FxDueRow[];

  // Today's market rate for every currency on this page. Cached for an hour by
  // `pkrRate`, so a page of USD mails costs one fetch, not one each.
  const currencies = [
    ...new Set(
      [...open.map((r) => r.parsed?.currency), ...fxDue.map((b) => b.original_currency)].filter(
        (c): c is string => Boolean(c) && c !== "PKR"
      )
    ),
  ];
  const rates = new Map(
    await Promise.all(currencies.map(async (c) => [c, await pkrRate(c)] as const))
  );

  const matches = new Map<string, InboxMatch>(
    reservations.map((r) => [
      r.id,
      matchReservation({
        source: r.source,
        propertyId: r.property_id,
        parsed: r.parsed ?? {},
        allUnits: units,
        holds,
        unitsWithCalendar: new Set(feeds.filter((f) => f.source === r.source).map((f) => f.property_id)),
        busy,
      }),
    ])
  );

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Channel inbox"
        back={{ href: "/admin/calendar/feeds", label: "Channel calendars" }}
        info={
          <p>
            Reservation emails forwarded from Airbnb and Booking.com, read automatically. A
            calendar link carries only dates, so this is where the guest&apos;s name and the
            money come from. Nothing here counts as a booking, and the owner is told nothing,
            until you approve it below.
          </p>
        }
      />

      {settings.channelInboxAddress ? (
        <p className="text-xs text-ink-muted -mt-2">
          Channel emails forwarded to{" "}
          <span className="text-ink-primary break-all">{settings.channelInboxAddress}</span> land here.{" "}
          <Link href="/admin/channel-inbox/setup" className="text-hostello-gold hover:underline">
            Setup &amp; whose are arriving
          </Link>
        </p>
      ) : (
        <p className={noticeBanner}>
          Coming soon — the address that feeds this inbox isn&apos;t live yet, so nothing arrives
          here on its own. Until it is, enter channel reservations through Bookings.{" "}
          <Link href="/admin/channel-inbox/setup" className="underline">
            Setup
          </Link>
        </p>
      )}

      {opsPreferences && (
        <details className="group">
          <summary className="text-xs text-hostello-gold cursor-pointer hover:underline">
            Alerts on this phone
          </summary>
          <div className="mt-3">
            <NotificationSettings preferences={opsPreferences} />
          </div>
        </details>
      )}

      {notice && <p className={noticeBanner}>{notice}</p>}
      {error && <p className={errorBanner}>{error}</p>}

      {fxDue.length > 0 && (
        <section className="card p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Re-convert at today&apos;s rate</h2>
            <p className="text-xs text-ink-muted">
              These guests have arrived, and their price is still at the rate from the day they
              booked. Re-converting recomputes the split and tells the owner the new price.
            </p>
          </div>
          <div className="flex flex-col divide-y divide-border-hairline">
            {fxDue.map((b) => {
              const amount = Number(b.original_amount);
              const today = rates.get(b.original_currency);
              const next = today ? toPkr(amount, today) : null;
              const now = Number(b.sale_price ?? 0);
              const locked = Boolean(b.settled || b.share_received);
              return (
                <div key={b.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <Link href={`/admin/bookings/${b.id}`} className="text-sm hover:underline truncate">
                      {b.guest_name ?? "A guest"} · arrived {formatDayMonth(b.check_in)}
                    </Link>
                    <span className="text-xs text-ink-muted">
                      {money(amount, b.original_currency)} · booked at {Number(b.fx_rate ?? 0).toFixed(2)}
                      {b.fx_rate_on ? ` (${formatDayMonth(b.fx_rate_on)})` : ""} = {formatPKR(now)}
                      {locked
                        ? " · already settled, so the rate stays"
                        : next !== null
                          ? ` → today ${today!.pkrPerUnit.toFixed(2)} = ${formatPKR(next)} (${next >= now ? "+" : "−"}${formatPKR(Math.abs(next - now))})`
                          : " · today's rate could not be fetched"}
                    </span>
                  </div>
                  <form action={keepBookingRate} className="shrink-0">
                    <input type="hidden" name="booking_id" value={b.id} />
                    <SubmitButton className={secondaryButton} busy="Keeping…">
                      Keep this rate
                    </SubmitButton>
                  </form>
                </div>
              );
            })}
          </div>
          <form action={reconvertBookings} className="flex gap-2">
            {fxDue.map((b) => (
              <input key={b.id} type="hidden" name="booking_ids" value={b.id} />
            ))}
            <SubmitButton
              className={primaryButton}
              blocking
              busy="Re-converting…"
              note="Fetching today's rate and recomputing each stay's split."
            >
              {fxDue.length === 1 ? "Re-convert it" : `Re-convert all ${fxDue.length}`}
            </SubmitButton>
          </form>
        </section>
      )}

      {open.length === 0 && (
        <div className="card p-8 flex flex-col items-center gap-2 text-center">
          <Inbox className="w-5 h-5 text-ink-muted" aria-hidden />
          <p className="text-sm text-ink-secondary">Nothing waiting.</p>
          <p className="text-xs text-ink-muted">
            {settings.channelInboxAddress
              ? "A channel's reservation email appears here within a few seconds of being sent."
              : "Once the inbox address is live, a channel's reservation email will appear here within a few seconds of being sent."}
          </p>
        </div>
      )}

      {open.map((row) => {
        const parsed = row.parsed ?? {};
        const problems = blockers(row);
        const match = matches.get(row.id);
        const extranet = channelReservationUrl(row.source, parsed);
        const gmail = gmailForwarding(row);
        const booking = row.booking_id ? bookings.get(row.booking_id) : undefined;
        const linkedHold = row.booking_id ? linkedHolds.get(row.booking_id) : undefined;
        const foreign = parsed.currency && parsed.currency !== "PKR" ? parsed.currency : null;
        const rate = foreign ? rates.get(foreign) : undefined;
        const inPkr = (amount: number | null | undefined) =>
          amount === null || amount === undefined ? null : foreign ? (rate ? toPkr(amount, rate) : null) : amount;
        const holdDiffers =
          booking && linkedHold
            ? linkedHold.start_date !== booking.check_in ||
              addDaysISO(linkedHold.end_date, 1) !== booking.check_out
            : false;

        return (
          <div key={row.id} className="card p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    {row.kind === "new_booking" && parsed.is_request
                      ? "Request to book"
                      : row.kind === "new_booking" && booking
                        ? "Request accepted"
                        : KIND_LABEL[row.kind]}
                  </span>
                  <Chip status={row.status} />
                </div>
                <Channel source={row.source} />
              </div>
              <span
                className={`text-xs shrink-0 ${waiting(row.received_at).late ? "text-status-pending" : "text-ink-muted"}`}
              >
                {waiting(row.received_at).text}
              </span>
            </div>

            {row.subject && (
              <p className="text-xs text-ink-muted break-words">{row.subject}</p>
            )}

            {parsed.listing && (
              <Fact
                label="Listing the email named"
                value={
                  row.properties?.name
                    ? `${parsed.listing} → ${row.properties.name}`
                    : parsed.listing
                }
              />
            )}

            {row.parse_error && !gmail && <p className={errorBanner}>{row.parse_error}</p>}

            {problems.length > 0 && (
              <p className={errorBanner}>
                Cannot be approved yet — {problems.join("; ")}.
              </p>
            )}

            {/* ── A request the channel has now accepted: confirm the tentative booking ── */}
            {row.kind === "new_booking" && booking && booking.status === "tentative" && (
              <form action={confirmRequest} className="flex flex-col gap-4">
                <input type="hidden" name="id" value={row.id} />
                <BookingFacts booking={booking} />
                <p className="text-xs text-ink-muted">
                  {sourceLabel(row.source)} accepted this request. It&apos;s here as a tentative
                  booking, which earns nothing until it&apos;s confirmed.
                </p>
                <div className="flex flex-col gap-1.5 sm:max-w-[14rem]">
                  <label className={fieldLabel}>Sale price (PKR)</label>
                  <input
                    type="number"
                    name="sale_price"
                    min="0"
                    step="1"
                    defaultValue={inPkr(parsed.host_payout) ?? booking.sale_price ?? ""}
                    className={fieldInput}
                  />
                </div>
                <Conversion amount={parsed.host_payout} currency={parsed.currency} rate={rate} />
                <div className="flex gap-2">
                  <SubmitButton
                    className={primaryButton}
                    blocking
                    busy="Confirming the booking…"
                    note="Working out the payout now that the stay is real."
                  >
                    Confirm the booking
                  </SubmitButton>
                </div>
              </form>
            )}

            {/* ── A new reservation: the approval form ── */}
            {row.kind === "new_booking" && match && !row.booking_id && (
              <form action={approveReservation} className="flex flex-col gap-4">
                <input type="hidden" name="id" value={row.id} />
                {match.hold && <input type="hidden" name="from_block" value={match.hold.id} />}

                <CalendarLine row={row} match={match} />

                {match.units.length === 1 ? (
                  <input type="hidden" name="property_id" value={match.units[0].id} />
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>
                      {row.property_id || !parsed.listing_id || row.source !== "booking_com"
                        ? "Which unit is this?"
                        : "Which unit gets this guest?"}
                    </label>
                    <select
                      name="property_id"
                      required
                      defaultValue={match.unitId ?? ""}
                      className={fieldInput}
                    >
                      <option value="">Pick a unit…</option>
                      {match.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                          {u.booking_room_type ? ` · ${u.booking_room_type}` : ""}
                          {!row.property_id && !parsed.listing_id && u.clientName ? ` · ${u.clientName}` : ""}
                          {match.takenUnitIds.includes(u.id) ? " — taken on these dates" : ""}
                        </option>
                      ))}
                    </select>
                    {!row.property_id && parsed.listing_id && row.source === "airbnb" && (
                      <p className="text-xs text-ink-muted">
                        No unit has this Airbnb listing number yet. Approving links it to the one
                        you pick, so the next email finds it on its own.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>Guest name</label>
                    <input
                      name="guest_name"
                      required
                      defaultValue={parsed.guest_name ?? ""}
                      className={fieldInput}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>
                      Guest phone
                      {row.source === "airbnb" && " (Airbnb never sends it)"}
                    </label>
                    <input
                      name="guest_phone"
                      defaultValue={parsed.guest_phone ?? ""}
                      className={fieldInput}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>Check-in</label>
                    <input
                      type="date"
                      name="check_in"
                      required
                      defaultValue={match.checkIn ?? ""}
                      className={fieldInput}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>Check-out</label>
                    <input
                      type="date"
                      name="check_out"
                      required
                      defaultValue={match.checkOut ?? ""}
                      className={fieldInput}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>Sale price (PKR)</label>
                    <input
                      type="number"
                      name="sale_price"
                      min="0"
                      step="1"
                      required
                      defaultValue={inPkr(parsed.host_payout ?? parsed.gross) ?? ""}
                      className={fieldInput}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>Guests</label>
                    <input
                      type="number"
                      name="guests_count"
                      min="1"
                      step="1"
                      defaultValue={parsed.guests ?? ""}
                      className={fieldInput}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>Status</label>
                    <select
                      name="status"
                      defaultValue={parsed.is_request ? "tentative" : "confirmed"}
                      className={fieldInput}
                    >
                      <option value="confirmed">Confirmed</option>
                      <option value="tentative">Tentative</option>
                    </select>
                  </div>
                </div>

                {/* The channel's own figures, for checking the sale price against
                    — never fed into the split, which payout.ts owns. */}
                {(parsed.gross || parsed.host_payout) && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-border-hairline pt-3">
                    <Fact label="Guest paid" value={money(parsed.gross, parsed.currency)} />
                    <Fact label="Channel fee" value={money(parsed.channel_fee, parsed.currency)} />
                    <Fact label="Channel pays out" value={money(parsed.host_payout, parsed.currency)} />
                  </div>
                )}

                <Conversion amount={parsed.host_payout ?? parsed.gross} currency={parsed.currency} rate={rate} />

                {extranet && (
                  <p className="text-xs text-ink-muted">
                    {row.source === "booking_com"
                      ? "Booking.com's email has no guest, departure or price in it — "
                      : "Anything missing is on the reservation itself — "}
                    <a
                      href={extranet}
                      target="_blank"
                      rel="noreferrer"
                      className="text-hostello-gold hover:underline"
                    >
                      open it on {sourceLabel(row.source)}
                    </a>
                    .
                  </p>
                )}

                <input
                  name="notes"
                  placeholder="Notes (optional)"
                  defaultValue={
                    row.external_ref ? `${sourceLabel(row.source)} ref ${row.external_ref}` : ""
                  }
                  className={fieldInput}
                />

                <p className="text-xs text-ink-muted">
                  {parsed.is_request
                    ? "A request the host hasn't accepted yet. Approving holds the nights as a tentative booking; when the channel confirms it, it shows up here to confirm."
                    : "Approving runs the client's own deal terms over the sale price, closes the nights, and notifies the owner."}
                </p>

                <div className="flex gap-2">
                  <SubmitButton
                    className={primaryButton}
                    blocking
                    busy="Adding the booking…"
                    note="Checking the dates are still free, then writing the stay and its payout."
                  >
                    Approve and add booking
                  </SubmitButton>
                </div>
              </form>
            )}

            {/* ── A cancellation we can act on ── */}
            {row.kind === "cancellation" && row.status === "pending" && (
              <form action={applyCancellation} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={row.id} />
                {booking ? (
                  <>
                    <BookingFacts booking={booking} />
                    <MatchNote row={row} />
                    <p className="text-xs text-ink-muted">
                      {linkedHold
                        ? `The ${sourceLabel(row.source)} calendar still shows this stay — it usually catches up within a minute.`
                        : `✓ The ${sourceLabel(row.source)} calendar has freed these nights too.`}{" "}
                      Confirming cancels the booking, reopens the nights and tells the owner.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Fact label="Guest" value={parsed.guest_name ?? "—"} />
                      <Fact
                        label="Dates"
                        value={
                          parsed.check_in && parsed.check_out ? nights(parsed.check_in, parsed.check_out) : "—"
                        }
                      />
                    </div>
                    <p className="text-xs text-ink-muted">
                      No booking here matches — by confirmation code, or by guest, dates and unit.
                      There may be nothing to cancel; if there is, cancel it from the booking.
                    </p>
                  </>
                )}
                <div className="flex gap-2">
                  <SubmitButton
                    className={primaryButton}
                    disabled={!booking || booking.status === "cancelled"}
                    blocking
                    busy="Cancelling the booking…"
                    note="Freeing the dates and notifying the client."
                  >
                    Cancel the booking
                  </SubmitButton>
                </div>
              </form>
            )}

            {/* ── A change: the booking's dates next to the channel's ── */}
            {row.kind === "alteration" && row.status === "pending" && booking && (
              <form action={applyAlteration} className="flex flex-col gap-4">
                <input type="hidden" name="id" value={row.id} />
                <BookingFacts booking={booking} />
                <MatchNote row={row} />
                <p className={linkedHold && holdDiffers ? errorBanner : "text-xs text-ink-muted"}>
                  {linkedHold
                    ? holdDiffers
                      ? `The ${sourceLabel(row.source)} calendar now shows ${nights(linkedHold.start_date, addDaysISO(linkedHold.end_date, 1))}. The new dates below are taken from it.`
                      : `The ${sourceLabel(row.source)} calendar still shows the booked dates — it may not have caught up yet, or only the price or guest count changed.`
                    : `No ${sourceLabel(row.source)} calendar is linked to this stay, so check the new dates on the reservation.`}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>New check-in</label>
                    <input
                      type="date"
                      name="check_in"
                      required
                      defaultValue={linkedHold?.start_date ?? booking.check_in}
                      className={fieldInput}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>New check-out</label>
                    <input
                      type="date"
                      name="check_out"
                      required
                      defaultValue={linkedHold ? addDaysISO(linkedHold.end_date, 1) : booking.check_out}
                      className={fieldInput}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>Sale price (PKR)</label>
                    <input
                      type="number"
                      name="sale_price"
                      min="0"
                      step="1"
                      defaultValue={inPkr(parsed.host_payout) ?? booking.sale_price ?? ""}
                      className={fieldInput}
                    />
                  </div>
                </div>
                <Conversion amount={parsed.host_payout} currency={parsed.currency} rate={rate} />
                <p className="text-xs text-ink-muted">
                  {parsed.host_payout
                    ? "The price is the new payout from the email."
                    : "The email doesn't say the new price, so this is the booking's current one."}{" "}
                  {extranet && (
                    <a href={extranet} target="_blank" rel="noreferrer" className="text-hostello-gold hover:underline">
                      Check it on {sourceLabel(row.source)}
                    </a>
                  )}
                  {extranet && ". "}
                  Applying recomputes the split from the booking&apos;s own terms and tells the owner.
                </p>
                <div className="flex gap-2">
                  <SubmitButton
                    className={primaryButton}
                    blocking
                    busy="Applying the change…"
                    note="Checking the new dates are free, then recomputing the payout."
                  >
                    Apply the change
                  </SubmitButton>
                </div>
              </form>
            )}

            {/* ── A payout notice: surfaced here, recorded where money is ── */}
            {row.kind === "payout" && row.status === "pending" && (
              <form action={markHandled} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={row.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Fact label="Guest" value={parsed.guest_name ?? "—"} />
                  <Fact label="Channel paid" value={money(parsed.host_payout, parsed.currency)} />
                </div>
                <p className="text-xs text-ink-muted">
                  This is the channel saying it sent money — it settles nothing on its own. Record it
                  on{" "}
                  <Link href="/admin/settlements?tab=to-hostello" className="text-hostello-gold hover:underline">
                    Owed to Hostello
                  </Link>{" "}
                  if it applies, then tick it off here.
                </p>
                <input name="admin_note" placeholder="What you did (optional)" className={fieldInput} />
                <div className="flex gap-2">
                  <SubmitButton className={secondaryButton} busy="Marking it handled…">
                    Mark handled
                  </SubmitButton>
                </div>
              </form>
            )}

            {/* ── Gmail asking to confirm a forwarding filter ── */}
            {gmail && (
              <div className="flex flex-col gap-2">
                <p className="text-sm">
                  {gmail.requester ?? "A Gmail account"} wants to forward its emails here. Confirm it
                  only if you expect it — an owner or Hostello setting up forwarding.
                </p>
                {gmail.link ? (
                  <a
                    href={gmail.link}
                    target="_blank"
                    rel="noreferrer"
                    className={`${primaryButton} self-start`}
                  >
                    Confirm forwarding
                  </a>
                ) : (
                  <p className="text-xs text-ink-muted">No link found — see the email below.</p>
                )}
                {gmail.code && (
                  <p className="text-xs text-ink-muted">
                    Or give the owner this confirmation code: <span className="text-ink-primary">{gmail.code}</span>
                  </p>
                )}
                <p className="text-xs text-ink-muted">Dismiss this card once it&apos;s done.</p>
              </div>
            )}

            {/* ── Unreadable: show the bytes, let it be dismissed ── */}
            {row.status === "failed" && row.raw_text && (
              <details className="text-xs text-ink-muted">
                <summary className="cursor-pointer hover:text-ink-secondary">
                  Show the email
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-words max-h-56 overflow-y-auto bg-surface-2 rounded-md p-3">
                  {row.raw_text.slice(0, 4000)}
                </pre>
              </details>
            )}

            <form action={dismissMessage} className="flex items-center gap-2">
              <input type="hidden" name="id" value={row.id} />
              <input
                name="admin_note"
                placeholder="Why (optional)"
                className={`${fieldInput} flex-1`}
              />
              <SubmitButton className={secondaryButton} busy="Dismissing the message…">
                Dismiss
              </SubmitButton>
            </form>
          </div>
        );
      })}

      {unexplained.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-ink-secondary -mb-2">
            Calendar stays with no email
          </h2>
          <div className="card divide-y divide-border-hairline">
            {unexplained.map((h) => {
              const lastNight = addDaysISO(h.end_date, 1);
              const writeUp = `/admin/bookings/new?${new URLSearchParams({
                property: h.property_id,
                date: h.start_date,
                checkout: lastNight,
                source: h.source ?? "",
                block: h.id,
              }).toString()}`;
              return (
                <div key={h.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm truncate">
                      {unitName.get(h.property_id) ?? "A unit"} · {nights(h.start_date, lastNight)}
                    </span>
                    <span className="text-xs text-ink-muted">
                      <Channel source={h.source} /> · reserved {ago(h.created_at)}, no email since
                    </span>
                  </div>
                  <Link href={writeUp} className="text-xs text-hostello-gold hover:underline shrink-0">
                    Write it up
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-ink-muted -mt-3">
            The channel&apos;s calendar has these stays, but no reservation email arrived for them
            within an hour. Write each one up from the reservation itself — and check that
            listing&apos;s emails are being forwarded.
          </p>
        </>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-ink-secondary -mb-2">Already dealt with</h2>
          <div className="card divide-y divide-border-hairline">
            {closed.map((row) => (
              <div key={row.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm truncate">
                      {row.parsed?.guest_name ?? row.subject ?? "Channel email"}
                    </span>
                    <Chip status={row.status} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <Channel source={row.source} />
                    <span>· {KIND_LABEL[row.kind]}</span>
                    {row.admin_note && <span className="truncate">· {row.admin_note}</span>}
                  </div>
                </div>
                {row.booking_id ? (
                  <Link
                    href={`/admin/bookings/${row.booking_id}`}
                    className="text-xs text-hostello-gold hover:underline shrink-0"
                  >
                    Booking
                  </Link>
                ) : (
                  <span className="text-xs text-ink-muted shrink-0">{ago(row.received_at)}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
