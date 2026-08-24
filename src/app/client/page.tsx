import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Wallet, ArrowRight, Plus, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatPKR } from "@/lib/payout";
import { todayISO, addDaysISO } from "@/lib/calendar";

const QUICK_ACTIONS = [
  { href: "/client/bookings/new", label: "New Booking", icon: Plus },
  { href: "/client/calendar", label: "Check Availability", icon: CalendarDays },
  { href: "/client/calendar/block", label: "Block Dates", icon: Lock },
  { href: "/client/bookings", label: "Bookings & Payouts", icon: Wallet },
];

export default async function ClientDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name")
    .eq("owner_user_id", user.id)
    .single();

  if (!clientRecord) redirect("/client");

  const { count: propertyCount } = await supabase
    .from("properties")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientRecord.id);

  const today = todayISO();
  const in14 = addDaysISO(today, 14);

  const { data: upcoming } = await supabase
    .from("bookings")
    .select("id, guest_name, check_in, check_out, status, booking_properties(properties(name))")
    .eq("client_id", clientRecord.id)
    .neq("status", "cancelled")
    .gte("check_in", today)
    .lte("check_in", in14)
    .order("check_in")
    .limit(6);

  const monthStart = today.slice(0, 7) + "-01";
  const { data: monthBookings } = await supabase
    .from("bookings")
    .select("sale_price, client_payout")
    .eq("client_id", clientRecord.id)
    .neq("status", "cancelled")
    .gte("check_in", monthStart);

  const monthTotals = (monthBookings ?? []).reduce(
    (acc, b) => {
      acc.gross += Number(b.sale_price ?? 0);
      acc.payout += Number(b.client_payout ?? 0);
      return acc;
    },
    { gross: 0, payout: 0 }
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-ink-muted text-xs tracking-wide">OVERVIEW</p>
        <h1 className="text-2xl font-semibold mt-1">Welcome, {clientRecord.name}</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="card p-4 md:p-6">
          <p className="text-ink-muted text-xs">Properties</p>
          <p className="text-2xl md:text-3xl font-semibold mt-2">{propertyCount ?? 0}</p>
        </div>
        <div className="card p-4 md:p-6">
          <p className="text-ink-muted text-xs">This month&apos;s revenue</p>
          <p className="text-xl md:text-2xl font-semibold mt-2 text-ink-primary">{formatPKR(monthTotals.gross)}</p>
        </div>
        <div className="card p-4 md:p-6 border border-hostello-gold/30">
          <p className="text-ink-muted text-xs">Your payout this month</p>
          <p className="text-xl md:text-2xl font-semibold mt-2 text-financial">{formatPKR(monthTotals.payout)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="card p-4 flex items-center gap-3 hover:border-border-strong border border-transparent transition-colors"
          >
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: "var(--color-hostello-gold)" }}
            >
              <a.icon size={16} className="text-surface-0" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-medium text-ink-primary">{a.label}</span>
          </Link>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-secondary">Upcoming check-ins (next 14 days)</h2>
          <Link href="/client/bookings" className="text-xs text-hostello-gold hover:underline flex items-center gap-1">
            <Wallet size={12} /> View all bookings
          </Link>
        </div>

        {(!upcoming || upcoming.length === 0) && (
          <div className="card p-8 text-center text-sm text-ink-secondary">
            Nothing checking in over the next two weeks.
          </div>
        )}

        {upcoming && upcoming.length > 0 && (
          <div className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
            {upcoming.map((b) => {
              const unitNames = (b.booking_properties as unknown as { properties: { name: string } | null }[])
                ?.map((bp) => bp.properties?.name)
                .filter(Boolean)
                .join(", ");
              return (
                <div key={b.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-sm text-ink-primary truncate">{unitNames || "—"}</p>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      {b.guest_name ?? "Guest"} · {b.check_in} → {b.check_out}
                    </p>
                  </div>
                  {b.status === "tentative" && (
                    <span className="text-xs text-status-pending shrink-0">Tentative</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
