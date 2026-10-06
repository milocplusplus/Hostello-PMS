import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ASKING_FIELDS } from "@/lib/bulk-rates";
import { errorBanner, noticeBanner } from "@/lib/form-styles";
import { PageHeader, EmptyState } from "@/components/shared/PageHeader";
import { BulkRatesTable, type RateRow } from "@/components/admin/BulkRatesTable";
import { bulkUpdateUnitRates } from "../clients/actions";

/**
 * Every active unit, to set or move the asking price on any number of them at
 * once. Asking prices only: stack rates are one client's deal terms and stay
 * on that client's own Rates page.
 */
export default async function RatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;

  const supabase = await createClient();
  const { data: units } = await supabase
    .from("properties")
    .select(
      "id, name, stack_rate, short_stay_stack_rate, max_guests, nightly_rate, short_stay_rate, clients(name)"
    )
    .eq("status", "active")
    .order("name");

  const num = (v: unknown) => (v === null ? null : Number(v));
  const rows: RateRow[] = (units ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    client: (u.clients as unknown as { name: string } | null)?.name ?? "No client",
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
        sub="Asking prices, every unit"
        info={
          <p>
            The price a guest is quoted, per night or per short stay. It is what Find dates shows
            and filters on; it changes no booking and no deal. Each owner gets one notice naming
            their units that changed.
          </p>
        }
      />
      {notice && <p className={noticeBanner}>{notice}</p>}
      {error && <p className={errorBanner}>{error}</p>}
      {rows.length === 0 ? (
        <EmptyState icon={Building2} title={<>No active units yet.</>} />
      ) : (
        <BulkRatesTable rows={rows} fields={ASKING_FIELDS} action={bulkUpdateUnitRates} />
      )}
    </div>
  );
}
