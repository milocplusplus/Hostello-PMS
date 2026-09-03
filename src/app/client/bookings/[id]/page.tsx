import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Clock, Phone, Users, StickyNote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { sourceLabel } from "@/lib/block-sources";
import { propertyTypeLabel } from "@/lib/property-types";
import { formatPKR, nightsBetween } from "@/lib/payout";
import { formatShortStayWindow, hhmm, rowShortStay } from "@/lib/short-stay";
import { formatDayMonth } from "@/lib/calendar";
import { Avatar } from "@/components/shared/Avatar";
import { StatusChip } from "@/components/shared/StatusChip";
import { ChannelBadge } from "@/components/admin/BookingActivity";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { BookingReceipts } from "@/components/shared/BookingReceipts";
import { listReceipts } from "@/lib/receipts";
import { GuestIdCards } from "@/components/shared/GuestIdCards";
import { listGuestIds } from "@/lib/guest-ids";
import { StayProgressCard } from "@/components/shared/StayProgress";
import { BookingQuickTools } from "@/components/shared/BookingQuickTools";
import {
  cancelClientBooking,
  markClientStayProgress,
  changeClientBookingDates,
  moveClientBookingUnits,
  uploadClientGuestIds,
  deleteClientGuestId,
} from "../actions";

function Line({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border-hairline last:border-0">
      <span className="text-xs text-ink-secondary">{label}</span>
      <span className={`num text-sm font-medium ${gold ? "text-financial" : "text-ink-primary"}`}>
        {value}
      </span>
    </div>
  );
}

export default async function ClientBookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ id_error?: string }>;
}) {
  const { id } = await params;
  const { id_error } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const { data: booking } = await supabase
    .from("bookings_v")
    .select(
      "id, guest_name, guest_phone, guests_count, check_in, check_out, is_short_stay, short_stay_start, short_stay_end, source, status, sale_price, advance_received, expected_arrival, expected_departure, checked_in_at, checked_out_at, notes, client_id, booking_properties(properties(id, name, city, type))"
    )
    .eq("id", id)
    .eq("client_id", clientRecord.id)
    .maybeSingle();

  if (!booking) notFound();

  // Their own active units — `properties_v`'s WHERE clause is what scopes this,
  // not a filter, so a booking can only ever move within their own portfolio.
  const [receipts, guestIds, { data: clientUnits }] = await Promise.all([
    listReceipts(supabase, booking.id),
    listGuestIds(supabase, booking.id),
    supabase
      .from("properties_v")
      .select("id, name")
      .eq("client_id", clientRecord.id)
      .eq("status", "active")
      .order("name"),
  ]);

  const units =((booking.booking_properties as unknown as {
    properties: { id: string; name: string; city: string | null; type: string | null } | null;
  }[]) ?? [])
    .map((bp) => bp.properties)
    .filter((p): p is { id: string; name: string; city: string | null; type: string | null } => Boolean(p));

  const nights = nightsBetween(booking.check_in, booking.check_out);
  const shortStay = rowShortStay(booking);
  const gross = Number(booking.sale_price ?? 0);
  const advance = Number(booking.advance_received ?? 0);

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      <div>
        <Link href="/client/bookings" className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Bookings
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap mt-2">
          <div className="flex items-center gap-3">
            <Avatar name={booking.guest_name} size={44} />
            <div>
              <h1 className="text-xl font-semibold">{booking.guest_name ?? "Guest"}</h1>
              <p className="text-xs text-ink-secondary mt-1 flex items-center gap-1.5">
                <ChannelBadge source={booking.source} />
                {sourceLabel(booking.source) ?? booking.source}
              </p>
            </div>
          </div>
          <StatusChip status={booking.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-secondary mb-3">Stay</h2>

          <div className="flex items-center gap-2 text-sm text-ink-primary">
            <CalendarDays size={14} className="text-ink-muted" />
            {shortStay
              ? formatDayMonth(booking.check_in)
              : `${formatDayMonth(booking.check_in)} → ${formatDayMonth(booking.check_out)}`}
            <span className="text-ink-muted text-xs">
              {shortStay
                ? `short stay · ${formatShortStayWindow(shortStay.start, shortStay.end)}`
                : `(${nights} ${nights === 1 ? "night" : "nights"})`}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            {units.length === 0 && <p className="text-xs text-ink-muted">No units linked.</p>}
            {units.map((u) => (
              <p key={u.id} className="text-xs text-ink-secondary">
                {u.name}
                <span className="text-ink-muted">
                  {[propertyTypeLabel(u.type), u.city].filter(Boolean).length > 0 &&
                    ` — ${[propertyTypeLabel(u.type), u.city].filter(Boolean).join(" · ")}`}
                </span>
              </p>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-1.5 text-xs text-ink-secondary">
            {booking.guest_phone && (
              // Tap to call, or open WhatsApp — the two ways anyone actually
              // reaches a guest. No messaging system behind it.
              <span className="flex items-center gap-2 flex-wrap">
                <Phone size={12} className="text-ink-muted" />
                <a href={`tel:${booking.guest_phone}`} className="hover:text-ink-primary transition-colors">
                  {booking.guest_phone}
                </a>
                <a
                  href={`https://wa.me/${booking.guest_phone.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-muted hover:text-hostello-gold transition-colors"
                >
                  WhatsApp
                </a>
              </span>
            )}
            {!shortStay && (booking.expected_arrival || booking.expected_departure) && (
              <span className="flex items-center gap-2">
                <Clock size={12} className="text-ink-muted" />
                {booking.expected_arrival
                  ? `Arriving ${hhmm(booking.expected_arrival)}`
                  : "Arrival time not given"}
                {booking.expected_departure && ` · leaving ${hhmm(booking.expected_departure)}`}
              </span>
            )}
            {booking.guests_count != null && (
              <span className="flex items-center gap-2">
                <Users size={12} className="text-ink-muted" />
                {booking.guests_count} {booking.guests_count === 1 ? "guest" : "guests"}
              </span>
            )}
          </div>
        </div>

        {/* What the guest pays and what has been collected. Your share of it,
            and whether it has reached you, are on /client/settlements — next
            to the payment proving it, which is the only place either can be
            acted on. A booking is the stay; it is not the ledger. */}
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-secondary mb-1">Payment</h2>
          <p className="text-[11px] text-ink-muted mb-2">What the guest is paying for this stay</p>

          <Line label="Sale price" value={formatPKR(gross)} />
          <Line label="Advance received" value={formatPKR(booking.advance_received)} />
          <Line label="Balance due" value={formatPKR(Math.max(0, gross - advance))} gold />
          <Link
            href="/client/settlements"
            className="mt-3 inline-block text-xs text-ink-muted hover:text-hostello-gold transition-colors"
          >
            Your payout and settlement →
          </Link>
        </div>
      </div>

      {booking.status !== "cancelled" && (
        <StayProgressCard
          bookingId={booking.id}
          checkedInAt={booking.checked_in_at}
          checkedOutAt={booking.checked_out_at}
          action={markClientStayProgress}
        />
      )}

      {booking.status !== "cancelled" && (
        <BookingQuickTools
          bookingId={booking.id}
          checkIn={booking.check_in}
          checkOut={booking.check_out}
          isShortStay={Boolean(shortStay)}
          units={clientUnits ?? []}
          currentUnitIds={units.map((u) => u.id)}
          changeDatesAction={changeClientBookingDates}
          moveUnitsAction={moveClientBookingUnits}
        />
      )}

      {receipts.length > 0 && <BookingReceipts bookingId={booking.id} receipts={receipts} />}

      <GuestIdCards
        bookingId={booking.id}
        guestIds={guestIds}
        uploadAction={uploadClientGuestIds}
        deleteAction={deleteClientGuestId}
        viewerId={user.id}
        error={id_error}
      />

      {booking.notes && (
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-secondary mb-2 flex items-center gap-1.5">
            <StickyNote size={13} /> Notes
          </h2>
          <p className="text-sm text-ink-secondary whitespace-pre-wrap">{booking.notes}</p>
        </div>
      )}

      {booking.status !== "cancelled" && (
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/client/bookings/${booking.id}/edit`}
            className="text-xs text-ink-secondary border border-border-hairline rounded-md px-3 py-1.5 hover:border-border-strong transition-colors"
          >
            Edit booking
          </Link>
          <form action={cancelClientBooking}>
            <input type="hidden" name="id" value={booking.id} />
            <ConfirmDeleteButton
              confirmText="Cancel this booking? The dates free up on your calendar."
              label="Cancel booking"
              busy="Cancelling the booking…"
              className="text-xs text-ink-muted hover:text-status-booked transition-colors px-1"
            />
          </form>
          <Link
            href="/client/calendar"
            className="ml-auto text-xs text-ink-muted hover:text-ink-secondary transition-colors"
          >
            Calendar →
          </Link>
        </div>
      )}
    </div>
  );
}
