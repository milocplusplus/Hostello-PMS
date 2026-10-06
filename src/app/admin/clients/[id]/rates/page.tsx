import { Building2 } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { errorBanner, noticeBanner } from "@/lib/form-styles";
import { PageHeader, EmptyState } from "@/components/shared/PageHeader";
import { BulkRatesTable, type RateRow } from "@/components/admin/BulkRatesTable";
import { bulkUpdateUnitRates } from "../../actions";

/** One client's units, to change a rate, a price or capacity on several at once. */
export default async function ClientRatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireOwner();
  const { id } = await params;
  const { error, notice } = await searchParams;

  const supabase = await createClient();
  const [{ data: client }, { data: units }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", id).maybeSingle(),
    supabase
      .from("properties")
      .select("id, name, stack_rate, short_stay_stack_rate, max_guests, nightly_rate, short_stay_rate")
      .eq("client_id", id)
      .eq("status", "active")
      .order("name"),
  ]);
  if (!client) notFound();

  const num = (v: unknown) => (v === null ? null : Number(v));
  const rows: RateRow[] = (units ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    stack_rate: num(u.stack_rate),
    short_stay_stack_rate: num(u.short_stay_stack_rate),
    max_guests: num(u.max_guests),
    nightly_rate: num(u.nightly_rate),
    short_stay_rate: num(u.short_stay_rate),
  }));

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      <PageHeader
        title="Rates"
        sub={client.name}
        back={{ href: `/admin/clients/${id}`, label: client.name }}
        info={
          <p>
            Stack rates are deal terms: a booking keeps the rate it was made at, so a change here
            only affects bookings made from now on. Prices are what a guest is quoted on Find
            dates. The owner gets one notice for the change.
          </p>
        }
      />
      {notice && <p className={noticeBanner}>{notice}</p>}
      {error && <p className={errorBanner}>{error}</p>}
      {rows.length === 0 ? (
        <EmptyState icon={Building2} title={<>This client has no active units.</>} />
      ) : (
        <BulkRatesTable clientId={id} rows={rows} action={bulkUpdateUnitRates} />
      )}
    </div>
  );
}
