import Link from "next/link";
import { Plus, CalendarDays, Lock, Wallet, Users, ArrowRight, Clock, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatPKR } from "@/lib/payout";
import { getMonthGrid, parseMonthParam, todayISO, addDaysISO } from "@/lib/calendar";

const QUICK_ACTIONS = [
  { href: "/admin/bookings/new", label: "New Booking", icon: Plus },
  { href: "/admin/calendar", label: "Check Calendar", icon: CalendarDays },
  { href: "/admin/calendar/block", label: "Block Dates", icon: Lock },
  { href: "/admin/bookings", label: "Bookings & Payouts", icon: Wallet },
];

export default async function AdminDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user!.id)
    .single();

  const { count: clientCount } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true });

  const { count: propertyCount } = await supabase
    .from("properties")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  const { year, month0 } = parseMonthParam(undefined);
  const grid = getMonthGrid(year, month0);
  const visibleDates = grid.filter((c) => c.date !== null).map((c) => c.date as string);
  const monthStart = visibleDates[0];
  const monthEnd = visibleDates[visibleDates.length - 1];

  const { data: monthBookings } = await supabase
    .from("bookings")
    .select("sale_price, hostello_share, settled")
    .neq("status", "cancelled")
    .lte("check_in", monthEnd)
    .gte("check_out", monthStart);

  const totals = (monthBookings ?? []).reduce(
    (acc, b) => {
      acc.gross += Number(b.sale_price ?? 0);
      if (b.settled) {
        acc.received += Number(b.hostello_share ?? 0);
      } else {
        acc.awaiting += Number(b.hostello_share ?? 0);
      }
      return acc;
    },
    { gross: 0, received: 0, awaiting: 0 }
  );

  const today = todayISO();
  const in7 = addDaysISO(today, 7);

  const { data: upcoming } = await supabase
    .from("bookings")
    .select("id, guest_name, check_in, check_out, clients(name), booking_properties(properties(name))")
    .neq("status", "cancelled")
    .gte("check_in", today)
    .lte("check_in", in7)
    .order("check_in")
    .limit(6);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-ink-muted text-xs tracking-wide">OVERVIEW</p>
        <h1 className="text-2xl font-semibold mt-1">
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}
        </h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        <Link
          href="/admin/clients"
          className="card p-4 md:p-6 flex flex-col gap-1 hover:border-border-strong border border-transparent transition-colors"
        >
          <p className="text-ink-muted text-xs flex items-center gap-1">
            <Users size={12} /> Clients
          </p>
          <p className="text-2xl md:text-3xl font-semibold">{clientCount ?? 0}</p>
        </Link>
        <div className="card p-4 md:p-6 flex flex-col gap-1">
          <p className="text-ink-muted text-xs">Active properties</p>
          <p className="text-2xl md:text-3xl font-semibold">{propertyCount ?? 0}</p>
        </div>
        <div className="card p-4 md:p-6 flex flex-col gap-1">
          <p className="text-ink-muted text-xs">This month&apos;s revenue</p>
          <p className="text-xl md:text-2xl font-semibold text-ink-primary">{formatPKR(totals.gross)}</p>
        </div>
        <div className="card p-4 md:p-6 flex flex-col gap-1 border border-hostello-gold/30">
          <p className="text-ink-muted text-xs flex items-center gap-1">
            <Clock size={11} /> Awaiting
          </p>
          <p className="text-xl md:text-2xl font-semibold text-status-pending">{formatPKR(totals.awaiting)}</p>
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
          <h2 className="text-sm font-medium text-ink-secondary">Check-ins in the next 7 days</h2>
          <Link
            href="/admin/bookings"
            className="text-xs text-hostello-gold hover:underline flex items-center gap-1"
          >
            <CheckCircle2 size={12} /> View all bookings
          </Link>
        </div>

        {(!upcoming || upcoming.length === 0) && (
          <div className="card p-8 text-center text-sm text-ink-secondary">
            Nothing checking in over the next week.
          </div>
        )}

        {upcoming && upcoming.length > 0 && (
          <div className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
            {upcoming.map((b) => {
              const clientData = b.clients as unknown as { name: string } | null;
              const unitNames = (b.booking_properties as unknown as { properties: { name: string } | null }[])
                ?.map((bp) => bp.properties?.name)
                .filter(Boolean)
                .join(", ");
              return (
                <div key={b.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-sm text-ink-primary truncate">
                      {clientData?.name ?? "—"} · {unitNames || "—"}
                    </p>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      {b.guest_name ?? "Guest"} · {b.check_in} → {b.check_out}
                    </p>
                  </div>
                  <ArrowRight size={14} className="text-ink-muted shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
