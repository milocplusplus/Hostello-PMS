import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Clock, Phone, Users, StickyNote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { canSeeSplit, currentProfile, currentUser } from "@/lib/auth";
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
  markStayProgress,
  changeBookingDates,
  moveBookingUnits,
  cancelBooking,
  uploadBookingReceipt,
  deleteBookingReceipt,
  uploadGuestIds,
  deleteGuestId,
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

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ receipt_error?: string; id_error?: string }>;
}) {
  const { id } = await params;
  const { receipt_error, id_error } = await searchParams;

  const supabase = await createClient();
  const [user, profile] = await Promise.all([currentUser(), currentProfile()]);
  if (!user) redirect("/login");

  const showMoney = canSeeSplit(profile?.role);

  const { data: booking } = await supabase
    .from("bookings_v")
    .select(
      "id, guest_name, guest_phone, guests_count, check_in, check_out, source, status, sale_price, advance_received, is_short_stay, short_stay_start, short_stay_end, expected_arrival, expected_departure, checked_in_at, checked_out_at, notes, created_at, client_id, clients:clients_v(name), booking_properties(properties:properties_v(id, name, city, type))"
    )
    .eq("id", id)
    .maybeSingle();

  if (!booking) notFound();

  // Every unit this booking could move to. Scoped to its own client, because
  // `updateBooking` refuses a mix and there is no point offering the refusal.
  const [receipts, guestIds, { data: clientUnits }] = await Promise.all([
    listReceipts(supabase, booking.id),
    listGuestIds(supabase, booking.id),
    supabase
      .from("properties_v")
      .select("id, name")
      .eq("client_id", booking.client_id)
      .eq("status", "active")
      .order("name"),
  ]);

  const client = booking.clients as unknown as { name: string } | null;
  const units = ((booking.booking_properties as unknown as {
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
        <Link
          href="/admin/calendar"
          className="text-ink-muted text-xs hover:text-hostello-purple-light transition-colors"
        >
          ← Calendar
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap mt-3">
          <div className="flex items-center gap-3.5">
            <Avatar name={booking.guest_name} size={48} />
            <div>
              <h1 className="text-xl md:text-2xl font-semibold">
                {booking.guest_name ?? "Guest"}
              </h1>
              <p className="text-xs text-ink-secondary mt-1.5 flex items-center gap-1.5">
                <ChannelBadge source={booking.source} />
                {sourceLabel(booking.source) ?? booking.source}
                <span className="text-ink-muted">·</span>
                {client?.name ?? "—"}
              </p>
            </div>
          </div>
          <StatusChip status={booking.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="eyebrow mb-3">Stay</h2>

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
            {units.map((u) => {
              const label = (
                <>
                  {u.name}
                  <span className="text-ink-muted">
                    {[propertyTypeLabel(u.type), u.city].filter(Boolean).length > 0 &&
                      ` — ${[propertyTypeLabel(u.type), u.city].filter(Boolean).join(" · ")}`}
                  </span>
                </>
              );
              // Editing the unit lives under Clients & Properties, which is the
              // owner's. Ops reads the same line without a link into it.
              return showMoney ? (
                <Link
                  key={u.id}
                  href={`/admin/clients/${booking.client_id}/properties/${u.id}/edit`}
                  className="text-xs text-ink-secondary hover:text-ink-primary transition-colors"
                >
                  {label}
                </Link>
              ) : (
                <p key={u.id} className="text-xs text-ink-secondary">
                  {label}
                </p>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col gap-1.5 text-xs text-ink-secondary">
            {booking.guest_phone && (
              // Tap to call, or open WhatsApp — the two ways anyone here
              // actually reaches a guest. No messaging system behind it.
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
            {booking.guests_count != null && (
              <span className="flex items-center gap-2">
                <Users size={12} className="text-ink-muted" />
                {booking.guests_count} {booking.guests_count === 1 ? "guest" : "guests"}
              </span>
            )}
            {/* A short stay's hours are already on the dates line above. */}
            {!shortStay && (booking.expected_arrival || booking.expected_departure) && (
              <span className="flex items-center gap-2">
                <Clock size={12} className="text-ink-muted" />
                {booking.expected_arrival
                  ? `Arriving ${hhmm(booking.expected_arrival)}`
                  : "Arrival time not given"}
                {booking.expected_departure && ` · leaving ${hhmm(booking.expected_departure)}`}
              </span>
            )}
          </div>
        </div>

        {/* What the guest owes and what they have handed over — the same card
            for both staff roles now. The split behind it, the deal that
            produced it and whether either side has been settled all live on
            /admin/settlements, next to the payments that prove them. A booking
            is the stay; it is not the ledger. */}
        <div className="card p-5">
          <h2 className="eyebrow mb-3">Payment</h2>
          <Line label="Sale price" value={formatPKR(gross)} />
          <Line label="Advance received" value={formatPKR(booking.advance_received)} />
          <Line label="Balance due" value={formatPKR(Math.max(0, gross - advance))} gold />
          {showMoney && (
            <Link
              href="/admin/settlements"
              className="mt-3 inline-block text-xs text-ink-muted hover:text-hostello-gold transition-colors"
            >
              Split and settlement →
            </Link>
          )}
        </div>
      </div>

      {booking.status !== "cancelled" && (
        <StayProgressCard
          bookingId={booking.id}
          checkedInAt={booking.checked_in_at}
          checkedOutAt={booking.checked_out_at}
          action={markStayProgress}
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
          changeDatesAction={changeBookingDates}
          moveUnitsAction={moveBookingUnits}
        />
      )}

      {/* A hostello_to_client receipt *is* the split, in a screenshot. */}
      {showMoney && (
        <BookingReceipts
          bookingId={booking.id}
          receipts={receipts}
          uploadAction={uploadBookingReceipt}
          deleteAction={deleteBookingReceipt}
          error={receipt_error}
        />
      )}

      <GuestIdCards
        bookingId={booking.id}
        guestIds={guestIds}
        uploadAction={uploadGuestIds}
        deleteAction={deleteGuestId}
        error={id_error}
      />

      {booking.notes && (
        <div className="card p-5">
          <h2 className="eyebrow mb-2.5 flex items-center gap-1.5">
            <StickyNote size={13} /> Notes
          </h2>
          <p className="text-sm text-ink-secondary whitespace-pre-wrap">{booking.notes}</p>
        </div>
      )}

      {booking.status !== "cancelled" && (
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/admin/bookings/${booking.id}/edit`}
            className="btn btn-ghost btn-sm"
          >
            Edit booking
          </Link>
          {showMoney && (
            <Link href="/admin/settlements" className="btn btn-ghost btn-sm">
              Settlements
            </Link>
          )}
          <form action={cancelBooking}>
            <input type="hidden" name="id" value={booking.id} />
            <ConfirmDeleteButton
              confirmText="Cancel this booking? The dates free up and the client is notified."
              label="Cancel booking"
              busy="Cancelling the booking…"
              className="text-xs text-ink-muted hover:text-status-booked transition-colors px-1"
            />
          </form>
          <Link
            href="/admin/bookings"
            className="ml-auto text-xs text-ink-muted hover:text-ink-secondary transition-colors"
          >
            All bookings →
          </Link>
        </div>
      )}
    </div>
  );
}
