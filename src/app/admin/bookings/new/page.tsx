import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { canSeeSplit, currentProfile } from "@/lib/auth";
import { createBooking } from "../actions";
import { BookingForm } from "@/components/admin/BookingForm";
import { listUnavailable } from "@/lib/availability";
import { BOOKING_SOURCES } from "@/lib/block-sources";
import type { DealModel, OtaModel } from "@/lib/payout";
import { PageHeader, EmptyState } from "@/components/shared/PageHeader";
import { bookingDefaults, loadSettings } from "@/lib/settings";

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    property?: string;
    date?: string;
    checkout?: string;
    client?: string;
    source?: string;
    /** An imported channel hold being written up — see the calendar's bars. */
    block?: string;
  }>;
}) {
  const { error, property, date, checkout, client, source, block } = await searchParams;

  const supabase = await createClient();
  const showMoney = canSeeSplit((await currentProfile())?.role);

  const { data: clients } = await supabase
    .from("clients_v")
    .select("id, name, deal_model, share_percent, deduct_percent, ota_model, ota_share_percent")
    // A deactivated client takes no new bookings (the database refuses them too).
    .is("deactivated_at", null)
    .order("name");

  const { data: properties } = await supabase
    .from("properties_v")
    .select("id, name, stack_rate, short_stay_stack_rate, client_id, clients:clients_v(name)")
    .eq("bookable", true)
    .order("name");

  const propertyOptions =
    properties?.map((p) => ({
      id: p.id,
      name: p.name,
      stack_rate: Number(p.stack_rate ?? 0),
      short_stay_stack_rate: Number(p.short_stay_stack_rate ?? 0),
      client_id: p.client_id,
      client_name: (p.clients as unknown as { name: string } | null)?.name ?? "—",
    })) ?? [];

  const clientTerms =
    clients?.map((c) => ({
      id: c.id,
      deal_model: c.deal_model as DealModel,
      share_percent: Number(c.share_percent),
      deduct_percent: Number(c.deduct_percent),
      ota_model: c.ota_model as OtaModel,
      ota_share_percent: Number(c.ota_share_percent),
    })) ?? [];

  // The hold this booking is being written up from must not grey out its own
  // nights; the write checks it again before it trusts the form.
  const unavailable = await listUnavailable(
    supabase,
    propertyOptions.map((p) => p.id),
    { excludeBlockId: block }
  );

  const initialPropertyId =
    property && propertyOptions.some((p) => p.id === property)
      ? property
      : client
        ? propertyOptions.find((p) => p.client_id === client)?.id
        : undefined;

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Add a booking"
        sub="Four quick steps — the stay card fills in as you go."
        back={{ href: "/admin/calendar", label: "Calendar" }}
      />

      {propertyOptions.length === 0 ? (
        <EmptyState icon={Building2} title={<>No active properties yet. Add a client and property first.</>} />
      ) : (
        <BookingForm
          action={createBooking}
          properties={propertyOptions}
          clients={clientTerms}
          initialPropertyId={initialPropertyId}
          initialDate={date}
          initialCheckOut={checkout}
          initialSource={BOOKING_SOURCES.some((s) => s.value === source) ? source : undefined}
          fromBlockId={block}
          unavailable={unavailable}
          showPayoutPreview={showMoney}
          canSetShare={showMoney}
          defaults={bookingDefaults(await loadSettings())}
          error={error}
        />
      )}
    </div>
  );
}
