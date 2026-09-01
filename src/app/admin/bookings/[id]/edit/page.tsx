import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canSeeSplit, currentProfile } from "@/lib/auth";
import { updateBooking } from "../../actions";
import { BookingForm } from "@/components/admin/BookingForm";
import { listUnavailable } from "@/lib/availability";
import { rowShortStay } from "@/lib/short-stay";
import type { DealModel, OtaModel } from "@/lib/payout";

export default async function EditBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const showMoney = canSeeSplit((await currentProfile())?.role);

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, client_id, guest_name, guest_phone, check_in, check_out, is_short_stay, short_stay_start, short_stay_end, source, status, sale_price, advance_received, notes, booking_properties(property_id)"
    )
    .eq("id", id)
    .single();

  if (!booking) notFound();

  // Cancelling is the end of a booking's life — reopening one for edit would
  // quietly resurrect it on the calendar.
  if (booking.status === "cancelled") redirect(`/admin/bookings/${id}`);

  const bookedIds = (booking.booking_properties as unknown as { property_id: string }[]).map(
    (bp) => bp.property_id
  );

  const [{ data: clientRecord }, { data: properties }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, deal_model, share_percent, deduct_percent, ota_model, ota_share_percent")
      .eq("id", booking.client_id)
      .single(),
    supabase
      .from("properties")
      .select("id, name, stack_rate, short_stay_stack_rate, client_id, status")
      .eq("client_id", booking.client_id)
      .order("name"),
  ]);

  if (!clientRecord) notFound();

  // Retired units stay selectable when this booking already sits on one, or
  // reopening it would silently move the stay to a different property.
  const propertyOptions = (properties ?? [])
    .filter((p) => p.status === "active" || bookedIds.includes(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      stack_rate: Number(p.stack_rate ?? 0),
      short_stay_stack_rate: Number(p.short_stay_stack_rate ?? 0),
      client_id: p.client_id,
      client_name: clientRecord.name,
    }));

  // This booking's own nights must not read as taken — it is the one being moved.
  const unavailable = await listUnavailable(
    supabase,
    propertyOptions.map((p) => p.id),
    { from: booking.check_in, excludeBookingId: id }
  );

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-6">
      <div>
        <Link href={`/admin/bookings/${id}`} className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Booking
        </Link>
        <h1 className="text-xl font-medium mt-1">Edit booking</h1>
        <p className="text-xs text-ink-muted mt-1">
          {clientRecord.name} · the payout is recalculated on this booking&rsquo;s own terms, not
          today&rsquo;s.
        </p>
      </div>

      <BookingForm
        action={updateBooking.bind(null, id)}
        properties={propertyOptions}
        clients={[
          {
            id: clientRecord.id,
            deal_model: clientRecord.deal_model as DealModel,
            share_percent: Number(clientRecord.share_percent),
            deduct_percent: Number(clientRecord.deduct_percent),
            ota_model: clientRecord.ota_model as OtaModel,
            ota_share_percent: Number(clientRecord.ota_share_percent),
          },
        ]}
        initialPropertyId={bookedIds[0]}
        initialDate={booking.check_in}
        initialCheckOut={booking.check_out}
        unavailable={unavailable}
        values={{
          guestName: booking.guest_name,
          guestPhone: booking.guest_phone,
          salePrice: Number(booking.sale_price ?? 0),
          advance: Number(booking.advance_received ?? 0),
          source: booking.source,
          status: booking.status as "confirmed" | "tentative",
          notes: booking.notes,
          extraUnitIds: bookedIds.slice(1),
          shortStay: rowShortStay(booking),
        }}
        submitLabel="Save changes"
        showPayoutPreview={showMoney}
        error={error}
      />
    </div>
  );
}
