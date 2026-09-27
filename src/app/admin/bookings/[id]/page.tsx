import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StickyNote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { canSeeSplit, currentProfile, currentUser } from "@/lib/auth";
import { propertyTypeLabel } from "@/lib/property-types";
import { formatPKR, nightsBetween } from "@/lib/payout";
import { formatNightly } from "@/lib/booking-price";
import { formatShortStayWindow, hhmm, rowShortStay } from "@/lib/short-stay";
import { todayISO } from "@/lib/calendar";
import { BookingHero, PaymentTiles } from "@/components/shared/BookingHero";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { BookingReceipts } from "@/components/shared/BookingReceipts";
import { listReceipts } from "@/lib/receipts";
import { GuestIdCards } from "@/components/shared/GuestIdCards";
import { listGuestIds } from "@/lib/guest-ids";
import { StayProgressCard } from "@/components/shared/StayProgress";
import { BookingQuickTools } from "@/components/shared/BookingQuickTools";
import { GuestMessages } from "@/components/shared/GuestMessages";
import { waPhone } from "@/lib/guest-messages";
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

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ receipt_error?: string; id_error?: string; tool_error?: string }>;
}) {
  const { id } = await params;
  const { receipt_error, id_error, tool_error } = await searchParams;

  const supabase = await createClient();
  const [user, profile] = await Promise.all([currentUser(), currentProfile()]);
  if (!user) redirect("/login");

  const showMoney = canSeeSplit(profile?.role);

  const { data: booking } = await supabase
    .from("bookings_v")
    .select(
      "id, guest_name, guest_phone, guests_count, check_in, check_out, source, status, sale_price, nightly_price, advance_received, is_short_stay, short_stay_start, short_stay_end, expected_arrival, expected_departure, checked_in_at, checked_out_at, notes, created_at, client_id, clients:clients_v(name), booking_properties(properties:properties_v(id, name, city, type))"
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
  const balanceDue = Math.max(0, gross - advance);
  // Null when nothing dialable is stored, which is what hides the WhatsApp link.
  const guestWa = waPhone(booking.guest_phone);
  // Arrival / departure times, when known. A short stay's hours are its dates.
  const timing =
    !shortStay && (booking.expected_arrival || booking.expected_departure)
      ? [
          booking.expected_arrival ? `In ${hhmm(booking.expected_arrival)}` : null,
          booking.expected_departure ? `Out ${hhmm(booking.expected_departure)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5 stagger">
      <BookingHero
        backHref="/admin/calendar"
        guestName={booking.guest_name}
        subtitle={client?.name}
        source={booking.source}
        status={booking.status}
        units={units.map((u) => ({
          id: u.id,
          name: u.name,
          detail: [propertyTypeLabel(u.type), u.city].filter(Boolean).join(" · "),
          // Editing the unit lives under Clients & Properties, which is the
          // owner's. Ops reads the same chip without a link into it.
          href: showMoney ? `/admin/clients/${booking.client_id}/properties/${u.id}/edit` : undefined,
        }))}
        checkIn={booking.check_in}
        checkOut={booking.check_out}
        today={todayISO()}
        hours={shortStay ? formatShortStayWindow(shortStay.start, shortStay.end) : null}
        guests={booking.guests_count}
        timing={timing}
        phone={booking.guest_phone}
        waNumber={guestWa}
        editHref={booking.status !== "cancelled" ? `/admin/bookings/${booking.id}/edit` : undefined}
      />

      {/* What the guest owes and what they have handed over — the same card
          for both staff roles. The split behind it and whether either side has
          been settled live on /admin/settlements. A booking is the stay; it is
          not the ledger. */}
      <section className="card p-4 md:p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg">Payment</h2>
          {showMoney && (
            <Link href="/admin/settlements" className="text-[13px] font-bold text-hostello-purple-light">
              Split &amp; settlement
            </Link>
          )}
        </div>
        <PaymentTiles
          sale={formatPKR(gross)}
          advance={formatPKR(booking.advance_received)}
          balance={formatPKR(balanceDue)}
          note={
            booking.nightly_price != null && !shortStay
              ? formatNightly(Number(booking.nightly_price), nights, formatPKR)
              : null
          }
        />
      </section>

      {/* A cancelled stay has no arrival to explain and no balance to chase. */}
      {booking.status !== "cancelled" && (
        <GuestMessages
          phone={booking.guest_phone}
          context={{
            guestName: booking.guest_name,
            unitNames: units.map((u) => u.name),
            checkIn: booking.check_in,
            checkOut: booking.check_out,
            balanceDue,
            expectedArrival: booking.expected_arrival,
            expectedDeparture: booking.expected_departure,
            shortStay,
          }}
        />
      )}

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
          error={tool_error}
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
          <h2 className="text-lg mb-2 flex items-center gap-2">
            <StickyNote size={16} className="text-hostello-purple-light" /> Notes
          </h2>
          <p className="text-sm text-ink-secondary whitespace-pre-wrap">{booking.notes}</p>
        </div>
      )}

      {booking.status !== "cancelled" && (
        <div className="flex items-center gap-2 flex-wrap">
          <form action={cancelBooking}>
            <input type="hidden" name="id" value={booking.id} />
            <ConfirmDeleteButton
              confirmText="Cancel this booking? The dates free up and the client is notified."
              label="Cancel booking"
              busy="Cancelling the booking…"
              className="btn btn-ghost text-negative"
            />
          </form>
          <Link href="/admin/bookings" className="btn btn-ghost ml-auto">
            All bookings
          </Link>
        </div>
      )}
    </div>
  );
}
