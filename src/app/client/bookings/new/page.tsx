import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { createClientBooking } from "../actions";
import { BookingForm } from "@/components/admin/BookingForm";
import { listUnavailable } from "@/lib/availability";
import type { DealModel, OtaModel } from "@/lib/payout";

export default async function ClientNewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; property?: string; date?: string }>;
}) {
  const { error, property, date } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, stack_rate")
    .eq("client_id", clientRecord.id)
    .eq("status", "active")
    .order("name");

  const propertyOptions =
    properties?.map((p) => ({
      id: p.id,
      name: p.name,
      stack_rate: Number(p.stack_rate ?? 0),
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
    <div className="max-w-lg mx-auto flex flex-col gap-6">
      <div>
        <Link href="/client/calendar" className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Calendar
        </Link>
        <h1 className="text-xl font-medium mt-1">Add a booking</h1>
      </div>

      {propertyOptions.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-secondary">
          No active properties yet.
        </div>
      ) : (
        <BookingForm
          action={createClientBooking}
          properties={propertyOptions}
          clients={clientTerms}
          initialPropertyId={property}
          initialDate={date}
          unavailable={unavailable}
          allowReceipt={false}
          error={error}
        />
      )}
    </div>
  );
}
