import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { updateClientBooking } from "../../actions";
import { BookingForm } from "@/components/admin/BookingForm";
import { listUnavailable } from "@/lib/availability";
import { hhmm, rowShortStay } from "@/lib/short-stay";
import type { Collector, DealModel, OtaModel } from "@/lib/payout";
import { PageHeader } from "@/components/shared/PageHeader";

export default async function EditClientBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings_v")
    .select(
      "id, client_id, guest_name, guest_phone, guests_count, expected_arrival, expected_departure, check_in, check_out, is_short_stay, short_stay_start, short_stay_end, source, status, sale_price, nightly_price, advance_received, advance_received_by, balance_received_by, notes, booking_properties(property_id)"
    )
    .eq("id", id)
    .eq("client_id", clientRecord.id)
    .single();

  if (!booking) notFound();
  if (booking.status === "cancelled") redirect(`/client/bookings/${id}`);

  const bookedIds = (booking.booking_properties as unknown as { property_id: string }[]).map(
    (bp) => bp.property_id
  );

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, stack_rate, short_stay_stack_rate, status")
    .eq("client_id", clientRecord.id)
    .order("name");

  // Retired units stay selectable when this booking already sits on one, or
  // reopening it would silently move the stay to a different property.
  const propertyOptions = (properties ?? [])
    .filter((p) => p.status === "active" || bookedIds.includes(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      stack_rate: Number(p.stack_rate ?? 0),
      short_stay_stack_rate: Number(p.short_stay_stack_rate ?? 0),
      client_id: clientRecord.id,
      client_name: clientRecord.name,
    }));

  const unavailable = await listUnavailable(
    supabase,
    propertyOptions.map((p) => p.id),
    { from: booking.check_in, excludeBookingId: id }
  );

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Edit booking"
        back={{ href: `/client/bookings/${id}`, label: "Booking" }}
        info={
          <p>
            Your payout is recalculated on this booking&rsquo;s own terms, not today&rsquo;s.
          </p>
        }
      />

      <BookingForm
        action={updateClientBooking.bind(null, id)}
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
          guestsCount: booking.guests_count,
          expectedArrival: booking.expected_arrival ? hhmm(booking.expected_arrival) : null,
          expectedDeparture: booking.expected_departure ? hhmm(booking.expected_departure) : null,
          salePrice: Number(booking.sale_price ?? 0),
          nightlyPrice: booking.nightly_price == null ? null : Number(booking.nightly_price),
          advance: Number(booking.advance_received ?? 0),
          advanceReceivedBy: booking.advance_received_by as Collector,
          balanceReceivedBy: booking.balance_received_by as Collector,
          source: booking.source,
          status: booking.status as "confirmed" | "tentative",
          notes: booking.notes,
          extraUnitIds: bookedIds.slice(1),
          shortStay: rowShortStay(booking),
        }}
        submitLabel="Save changes"
        allowReceipt={false}
        error={error}
      />
    </div>
  );
}
