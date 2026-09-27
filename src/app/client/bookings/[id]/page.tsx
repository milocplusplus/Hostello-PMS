import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StickyNote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
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
  cancelClientBooking,
  markClientStayProgress,
  changeClientBookingDates,
  moveClientBookingUnits,
  uploadClientGuestIds,
  deleteClientGuestId,
} from "../actions";

export default async function ClientBookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ id_error?: string; tool_error?: string }>;
}) {
  const { id } = await params;
  const { id_error, tool_error } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const { data: booking } = await supabase
    .from("bookings_v")
    .select(
      "id, guest_name, guest_phone, guests_count, check_in, check_out, is_short_stay, short_stay_start, short_stay_end, source, status, sale_price, nightly_price, advance_received, expected_arrival, expected_departure, checked_in_at, checked_out_at, notes, client_id, booking_properties(properties(id, name, city, type))"
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
        backHref="/client/bookings"
        guestName={booking.guest_name}
        source={booking.source}
        status={booking.status}
        units={units.map((u) => ({
          id: u.id,
          name: u.name,
          detail: [propertyTypeLabel(u.type), u.city].filter(Boolean).join(" · "),
        }))}
        checkIn={booking.check_in}
        checkOut={booking.check_out}
        today={todayISO()}
        hours={shortStay ? formatShortStayWindow(shortStay.start, shortStay.end) : null}
        guests={booking.guests_count}
        timing={timing}
        phone={booking.guest_phone}
        waNumber={guestWa}
        editHref={booking.status !== "cancelled" ? `/client/bookings/${booking.id}/edit` : undefined}
      />

      {/* What the guest pays and what has been collected. Your share of it,
          and whether it has reached you, are on /client/settlements — next
          to the payment proving it. A booking is the stay; it is not the ledger. */}
      <section className="card p-4 md:p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg">Payment</h2>
          <Link href="/client/settlements" className="text-[13px] font-bold text-hostello-purple-light">
            Your payout
          </Link>
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
          error={tool_error}
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
          <h2 className="text-lg mb-2 flex items-center gap-2">
            <StickyNote size={16} className="text-hostello-purple-light" /> Notes
          </h2>
          <p className="text-sm text-ink-secondary whitespace-pre-wrap">{booking.notes}</p>
        </div>
      )}

      {booking.status !== "cancelled" && (
        <div className="flex items-center gap-2 flex-wrap">
          <form action={cancelClientBooking}>
            <input type="hidden" name="id" value={booking.id} />
            <ConfirmDeleteButton
              confirmText="Cancel this booking? The dates free up on your calendar."
              label="Cancel booking"
              busy="Cancelling the booking…"
              className="btn btn-ghost text-negative"
            />
          </form>
          <Link href="/client/calendar" className="btn btn-ghost ml-auto">
            Calendar
          </Link>
        </div>
      )}
    </div>
  );
}
