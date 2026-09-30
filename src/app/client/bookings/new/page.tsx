import { Building2 } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { createClientBooking } from "../actions";
import { BookingForm } from "@/components/admin/BookingForm";
import { listUnavailable } from "@/lib/availability";
import type { DealModel, OtaModel } from "@/lib/payout";
import { PageHeader, EmptyState } from "@/components/shared/PageHeader";
import { bookingDefaults, loadSettings } from "@/lib/settings";

export default async function ClientNewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; property?: string; date?: string; checkout?: string }>;
}) {
  const { error, property, date, checkout } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, stack_rate, short_stay_stack_rate")
    .eq("client_id", clientRecord.id)
    .eq("status", "active")
    .order("name");

  const propertyOptions =
    properties?.map((p) => ({
      id: p.id,
      name: p.name,
      stack_rate: Number(p.stack_rate ?? 0),
      short_stay_stack_rate: Number(p.short_stay_stack_rate ?? 0),
      client_id: clientRecord.id,
      client_name: clientRecord.name,
    })) ?? [];

  const unavailable = await listUnavailable(
    supabase,
    propertyOptions.map((p) => p.id)
  );

  const clientTerms = [
    {
      id: clientRecord.id,
      deal_model: clientRecord.deal_model as DealModel,
      share_percent: Number(clientRecord.share_percent),
      deduct_percent: Number(clientRecord.deduct_percent),
      ota_model: clientRecord.ota_model as OtaModel,
      ota_share_percent: Number(clientRecord.ota_share_percent),
    },
  ];

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Add a booking"
        sub="Four quick steps — the stay card fills in as you go."
        back={{ href: "/client/calendar", label: "Calendar" }}
      />

      {propertyOptions.length === 0 ? (
        <EmptyState icon={Building2} title={<>No active properties yet.</>} />
      ) : (
        <BookingForm
          action={createClientBooking}
          properties={propertyOptions}
          clients={clientTerms}
          initialPropertyId={property}
          initialDate={date}
          initialCheckOut={checkout}
          unavailable={unavailable}
          allowReceipt={false}
          defaults={bookingDefaults(await loadSettings())}
          error={error}
        />
      )}
    </div>
  );
}
