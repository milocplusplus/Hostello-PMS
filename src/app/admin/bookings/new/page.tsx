import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createBooking } from "../actions";
import { BookingForm } from "@/components/admin/BookingForm";
import type { DealModel, OtaModel } from "@/lib/payout";

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; property?: string; date?: string; client?: string }>;
}) {
  const { error, property, date, client } = await searchParams;

  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, deal_model, share_percent, deduct_percent, ota_model, ota_share_percent")
    .order("name");

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, stack_rate, client_id, clients(name)")
    .eq("status", "active")
    .order("name");

  const propertyOptions =
    properties?.map((p) => ({
      id: p.id,
      name: p.name,
      stack_rate: Number(p.stack_rate ?? 0),
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

  const initialPropertyId =
    property && propertyOptions.some((p) => p.id === property)
      ? property
      : client
        ? propertyOptions.find((p) => p.client_id === client)?.id
        : undefined;

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-6">
      <div>
        <Link href="/admin/calendar" className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Calendar
        </Link>
        <h1 className="text-xl font-medium mt-1">Add a booking</h1>
      </div>

      {propertyOptions.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-secondary">
          No active properties yet. Add a client and property first.
        </div>
      ) : (
        <BookingForm
          action={createBooking}
          properties={propertyOptions}
          clients={clientTerms}
          initialPropertyId={initialPropertyId}
          initialDate={date}
          error={error}
        />
      )}
    </div>
  );
}
