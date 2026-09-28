import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/calendar";
import { formatPKR } from "@/lib/payout";
import { parsePeriod, periodRange } from "@/lib/period";
import { statsBySource, type StatsBooking } from "@/lib/stats";
import { Delta } from "@/components/shared/Kpi";
import { PeriodSelect } from "@/components/shared/PeriodSelect";
import { StatsBoard } from "@/components/shared/StatsBoard";
import { StatsClientSelect } from "@/components/admin/StatsClientSelect";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { PageHeader } from "@/components/shared/PageHeader";
import { ExportPanel } from "@/components/admin/ExportPanel";
import { exportData } from "./actions";

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; client?: string }>;
}) {
  const { period: periodParam, client = "" } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const period = periodRange(parsePeriod(periodParam), todayISO());

  // A confirmed stay counts whole in the month it checks in — the rule the Profit
  // tab and the dashboards use. A tentative stay is not money made.
  let windowQuery = supabase
    .from("bookings_v")
    .select("check_in, check_out, source, sale_price, hostello_share, client_payout")
    .eq("status", "confirmed")
    .gte("check_in", period.start)
    .lte("check_in", period.end);
  let prevQuery = supabase
    .from("bookings_v")
    .select("sale_price")
    .eq("status", "confirmed")
    .gte("check_in", period.prevStart)
    .lte("check_in", period.prevEnd);
  if (client) {
    windowQuery = windowQuery.eq("client_id", client);
    prevQuery = prevQuery.eq("client_id", client);
  }

  const [{ data: bookings }, { data: prevBookings }, { data: clients }] = await Promise.all([
    windowQuery,
    prevQuery,
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const rows = (bookings ?? []) as StatsBooking[];
  const { total, sources } = statsBySource(rows);
  const prevGross = (prevBookings ?? []).reduce((s, b) => s + Number(b.sale_price ?? 0), 0);

  // Cumulative daily series: each booking lands on its check-in day, which is
  // inside the window, so the last point equals the total above it.
  const dayIndex = new Map(period.days.map((d, i) => [d, i]));
  const perDay = new Array(period.days.length).fill(0);
  for (const b of rows) {
    const i = dayIndex.get(b.check_in) ?? 0;
    perDay[i] += Number(b.sale_price ?? 0);
  }
  const series = perDay.map(((sum) => (v: number) => (sum += v))(0));

  const scopeName = client ? (clients ?? []).find((c) => c.id === client)?.name : null;

  return (
    <div className="flex flex-col gap-4 stagger">
      <PageHeader title="Stats" sub={scopeName ?? "Every client"} />
      <div className="flex items-center gap-2 flex-wrap">
        <StatsClientSelect clients={clients ?? []} value={client} />
        <PeriodSelect value={period.key} />
      </div>

      <StatsBoard total={total} sources={sources} variant="admin" periodLabel={period.label} />

      <section className="card p-5 flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Revenue trend</h2>
          <p className="text-xs text-ink-muted mt-0.5">Cumulative — {period.label}</p>
        </div>
        <div>
          <p className="text-xl font-semibold">{formatPKR(total.gross)}</p>
          <Delta current={total.gross} previous={prevGross} suffix={period.compareLabel} />
        </div>
        {total.gross > 0 ? (
          <RevenueChart dates={period.days} series={series} />
        ) : (
          <p className="rounded-lg bg-surface-2/60 py-10 text-center text-sm text-ink-secondary">
            Nothing to chart for {period.label} yet.
          </p>
        )}
      </section>

      <ExportPanel today={todayISO()} clients={clients ?? []} initialClient={client} action={exportData} />
    </div>
  );
}
