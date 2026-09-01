import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { canSeeSplit, currentProfile, currentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import { sourceColor, sourceLabel } from "@/lib/block-sources";
import { formatDayMonth } from "@/lib/calendar";
import {
  KIND_LABEL,
  STATUS_LABEL,
  OPEN_STATUSES,
  statusTone,
  blockers,
  currencyWarning,
  type OtaMessageKind,
  type OtaMessageStatus,
  type ParsedReservation,
} from "@/lib/ota";
import {
  fieldLabel,
  fieldInput,
  primaryButton,
  primaryButtonStyle,
  secondaryButton,
  errorBanner,
  noticeBanner,
} from "@/lib/form-styles";
import {
  approveReservation,
  applyCancellation,
  assignProperty,
  dismissMessage,
  markHandled,
} from "./actions";

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

type PropertyRow = { id: string; name: string; clients: { name: string } | null };

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

function PropertySelect({
  properties,
  selected,
  required,
}: {
  properties: PropertyRow[];
  selected: string | null;
  required?: boolean;
}) {
  return (
    <select
      name="property_id"
      required={required}
      defaultValue={selected ?? ""}
      className={fieldInput}
    >
      <option value="">Pick a property…</option>
      {properties.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.clients?.name ? ` · ${p.clients.name}` : ""}
        </option>
      ))}
    </select>
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
      .select("id, name, clients:clients_v(name)")
      .eq("status", "active")
      .order("name"),
  ]);

  // A payout mail is the channel saying what it paid Hostello, and it is worked
  // on "Owed to Hostello" — both the owner's. Ops never sees that queue.
  const showMoney = canSeeSplit(profile?.role);
  const rows = ((messages ?? []) as unknown as MessageRow[]).filter(
    (r) => showMoney || r.kind !== "payout"
  );
  const properties = (props ?? []) as unknown as PropertyRow[];

  const open = rows.filter((r) => OPEN_STATUSES.includes(r.status));
  const closed = rows.filter((r) => !OPEN_STATUSES.includes(r.status));

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href="/admin/calendar/feeds"
          className="text-ink-muted text-xs hover:text-ink-secondary"
        >
          ← Channel calendars
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-xl font-medium">Channel inbox</h1>
          <span className="text-[9px] uppercase tracking-[0.12em] text-ink-muted border border-border-hairline rounded-full px-1.5 py-0.5">
            Soon
          </span>
        </div>
        <p className="text-sm text-ink-secondary mt-1">
          Reservation emails forwarded from Airbnb and Booking.com, read automatically. A
          calendar link carries only dates, so this is where the guest&apos;s name and the
          money come from. Nothing here counts as a booking, and the owner is told nothing,
          until you approve it below.
        </p>
      </div>

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
        const problems = blockers(row, parsed);
        const currency = currencyWarning(parsed);

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

            {/* ── A reservation with a property behind it: the approval form ── */}
            {row.kind === "new_booking" && row.property_id && (
              <form action={approveReservation} className="flex flex-col gap-4">
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="property_id" value={row.property_id} />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>Guest name</label>
                    <input
                      name="guest_name"
                      defaultValue={parsed.guest_name ?? ""}
                      className={fieldInput}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>
                      Guest phone
                      {row.source === "airbnb" && " (Airbnb masks this)"}
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
                      defaultValue={parsed.check_in ?? ""}
                      className={fieldInput}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={fieldLabel}>Check-out</label>
                    <input
                      type="date"
                      name="check_out"
                      required
                      defaultValue={parsed.check_out ?? ""}
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
                      defaultValue={parsed.gross ?? ""}
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-border-hairline pt-3">
                  <Fact
                    label="Channel says guest paid"
                    value={parsed.gross ? formatPKR(parsed.gross) : "—"}
                  />
                  <Fact
                    label="Channel says it will send"
                    value={parsed.host_payout ? formatPKR(parsed.host_payout) : "—"}
                  />
                  <Fact label="Guests" value={parsed.guests ? String(parsed.guests) : "—"} />
                </div>

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
                  <button
                    type="submit"
                    className={primaryButton}
                    style={primaryButtonStyle}
                    disabled={problems.length > 0}
                  >
                    Approve and add booking
                  </button>
                </div>
              </form>
            )}

            {/* ── Parsed fine, but nothing claims the listing ── */}
            {row.status === "needs_property" && (
              <form action={assignProperty} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={row.id} />
                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabel}>Which property is this?</label>
                  <PropertySelect properties={properties} selected={null} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Fact
                    label="Dates"
                    value={
                      parsed.check_in && parsed.check_out
                        ? `${formatDayMonth(parsed.check_in)} → ${formatDayMonth(parsed.check_out)}`
                        : "—"
                    }
                  />
                  <Fact label="Guest" value={parsed.guest_name ?? "—"} />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className={primaryButton} style={primaryButtonStyle}>
                    Map to this property
                  </button>
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
                  <button
                    type="submit"
                    className={primaryButton}
                    style={primaryButtonStyle}
                    disabled={!row.booking_id}
                  >
                    Cancel the booking
                  </button>
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
                      <Link href="/admin/payouts" className="text-hostello-gold hover:underline">
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
                  <button type="submit" className={secondaryButton}>
                    Mark handled
                  </button>
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
              <button type="submit" className={secondaryButton}>
                Dismiss
              </button>
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
