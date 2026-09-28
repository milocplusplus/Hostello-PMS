import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { canSeeSplit, currentProfile, currentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import { sourceColor, sourceLabel } from "@/lib/block-sources";
import { addDaysISO, formatDayMonth, todayISO } from "@/lib/calendar";
import { listUnavailable } from "@/lib/availability";
import {
  KIND_LABEL,
  STATUS_LABEL,
  OPEN_STATUSES,
  statusTone,
  blockers,
  currencyWarning,
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
  dismissMessage,
  markHandled,
} from "./actions";
import { PageHeader } from "@/components/shared/PageHeader";

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
  received_at: string;
  source: string | null;
  kind: OtaMessageKind;
  status: OtaMessageStatus;
  parse_error: string | null;
  parsed: ParsedReservation | null;
  external_ref: string | null;
  property_id: string | null;
  booking_id: string | null;
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
        "id, subject, received_at, source, kind, status, parse_error, parsed, external_ref, property_id, booking_id, admin_note, raw_text, properties:properties_v(name, clients:clients_v(name))"
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

  const [holdsRes, feedsRes, busy] =
    reservations.length > 0
      ? await Promise.all([
          supabase
            .from("calendar_blocks")
            .select("id, property_id, start_date, end_date, source")
            .not("feed_id", "is", null)
            .is("booking_id", null)
            .gte("end_date", from),
          supabase.from("calendar_feeds").select("property_id, source").eq("active", true),
          listUnavailable(supabase, unitIds, { from }),
        ])
      : [{ data: [] }, { data: [] }, []];

  const holds = (holdsRes.data ?? []) as ImportedHold[];
  const feeds = (feedsRes.data ?? []) as { property_id: string; source: string }[];

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

      <p className={noticeBanner}>
        Coming soon — the forwarding address that feeds this inbox isn&apos;t live yet, so
        nothing arrives here on its own. Until it is, enter channel reservations through
        Bookings.
      </p>

      {notice && <p className={noticeBanner}>{notice}</p>}
      {error && <p className={errorBanner}>{error}</p>}

      {open.length === 0 && (
        <div className="card p-8 flex flex-col items-center gap-2 text-center">
          <Inbox className="w-5 h-5 text-ink-muted" aria-hidden />
          <p className="text-sm text-ink-secondary">Nothing waiting.</p>
          <p className="text-xs text-ink-muted">
            Once the forwarding address is live, a channel&apos;s reservation email will appear
            here within a few seconds of being sent.
          </p>
        </div>
      )}

      {open.map((row) => {
        const parsed = row.parsed ?? {};
        const problems = blockers(row);
        const currency = currencyWarning(parsed);
        const match = matches.get(row.id);
        const extranet = channelReservationUrl(row.source, parsed);

        return (
          <div key={row.id} className="card p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{KIND_LABEL[row.kind]}</span>
                  <Chip status={row.status} />
                </div>
                <Channel source={row.source} />
              </div>
              <span className="text-xs text-ink-muted shrink-0">{ago(row.received_at)}</span>
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

            {row.parse_error && <p className={errorBanner}>{row.parse_error}</p>}
            {currency && <p className={errorBanner}>{currency}</p>}

            {problems.length > 0 && (
              <p className={errorBanner}>
                Cannot be approved yet — {problems.join("; ")}.
              </p>
            )}

            {/* ── A new reservation: the approval form ── */}
            {row.kind === "new_booking" && match && (
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
                      defaultValue={parsed.host_payout ?? parsed.gross ?? ""}
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
                    <select name="status" defaultValue="confirmed" className={fieldInput}>
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
                  Approving runs the client&apos;s own deal terms over the sale price, closes
                  the nights, and notifies the owner.
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
                <div className="grid grid-cols-2 gap-3">
                  <Fact label="Guest" value={parsed.guest_name ?? "—"} />
                  <Fact
                    label="Dates"
                    value={
                      parsed.check_in && parsed.check_out
                        ? `${formatDayMonth(parsed.check_in)} → ${formatDayMonth(parsed.check_out)}`
                        : "—"
                    }
                  />
                </div>
                {row.booking_id ? (
                  <p className="text-xs text-ink-muted">
                    Matches{" "}
                    <Link
                      href={`/admin/bookings/${row.booking_id}`}
                      className="text-hostello-gold hover:underline"
                    >
                      this booking
                    </Link>
                    . Confirming cancels it and reopens the nights.
                  </p>
                ) : (
                  <p className="text-xs text-ink-muted">
                    No booking here carries that confirmation code — there may be nothing to
                    cancel.
                  </p>
                )}
                <div className="flex gap-2">
                  <SubmitButton
                    className={primaryButton}
                    disabled={!row.booking_id}
                    blocking
                    busy="Cancelling the booking…"
                    note="Freeing the dates and notifying the client."
                  >
                    Cancel the booking
                  </SubmitButton>
                </div>
              </form>
            )}

            {/* ── Date change and payout: surfaced, applied where they belong ── */}
            {(row.kind === "alteration" || row.kind === "payout") && row.status === "pending" && (
              <form action={markHandled} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={row.id} />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Fact label="Guest" value={parsed.guest_name ?? "—"} />
                  <Fact
                    label={row.kind === "alteration" ? "New dates" : "Dates"}
                    value={
                      parsed.check_in && parsed.check_out
                        ? `${formatDayMonth(parsed.check_in)} → ${formatDayMonth(parsed.check_out)}`
                        : "—"
                    }
                  />
                  <Fact
                    label={row.kind === "payout" ? "Channel paid" : "New price"}
                    value={
                      row.kind === "payout"
                        ? parsed.host_payout
                          ? formatPKR(parsed.host_payout)
                          : "—"
                        : parsed.gross
                          ? formatPKR(parsed.gross)
                          : "—"
                    }
                  />
                </div>

                <p className="text-xs text-ink-muted">
                  {row.kind === "alteration" ? (
                    <>
                      Apply this on the booking itself, so the split is recomputed from the
                      terms it was saved with rather than today&apos;s.{" "}
                      {row.booking_id ? (
                        <Link
                          href={`/admin/bookings/${row.booking_id}/edit`}
                          className="text-hostello-gold hover:underline"
                        >
                          Open the booking
                        </Link>
                      ) : (
                        "No booking here matches that confirmation code."
                      )}{" "}
                      Then tick it off here.
                    </>
                  ) : (
                    <>
                      This is the channel saying it sent money — it settles nothing on its own.
                      Record it on{" "}
                      <Link
                        href="/admin/settlements?tab=to-hostello"
                        className="text-hostello-gold hover:underline"
                      >
                        Owed to Hostello
                      </Link>{" "}
                      if it applies, then tick it off here.
                    </>
                  )}
                </p>

                <input
                  name="admin_note"
                  placeholder="What you did (optional)"
                  className={fieldInput}
                />
                <div className="flex gap-2">
                  <SubmitButton className={secondaryButton} busy="Marking it handled…">
                    Mark handled
                  </SubmitButton>
                </div>
              </form>
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
