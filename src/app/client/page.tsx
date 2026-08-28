import Link from "next/link";
import { redirect } from "next/navigation";
import { Home, BarChart3, CircleDollarSign, CalendarDays, Wallet, Plus, Lock, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import {
  getMonthGrid,
  formatMonthLabel,
  parseMonthParam,
  addMonths,
  todayISO,
  addDaysISO,
} from "@/lib/calendar";
import {
  BookingActivity,
  type ActivityBooking,
} from "@/components/admin/BookingActivity";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { Kpi, Delta, OccupancyDonut } from "@/components/shared/Kpi";
import { PeriodSelect } from "@/components/shared/PeriodSelect";
import { Avatar } from "@/components/shared/Avatar";
import { StatusChip } from "@/components/shared/StatusChip";
import { parsePeriod, periodRange } from "@/lib/period";

const QUICK_ACTIONS = [
  { href: "/client/bookings/new", label: "New booking", icon: Plus },
  { href: "/client/calendar", label: "Check availability", icon: CalendarDays },
  { href: "/client/calendar/block", label: "Block dates", icon: Lock },
  { href: "/client/bookings", label: "Bookings & payouts", icon: Wallet },
];

type BookingRow = {
  id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  source: string;
  status: string;
  sale_price: number | null;
  client_payout: number | null;
  booking_properties: unknown;
};

function unitNames(row: { booking_properties: unknown }): string {
  return ((row.booking_properties as { properties: { name: string } | null }[] | null) ?? [])
    .map((bp) => bp.properties?.name)
    .filter(Boolean)
    .join(", ");
}

export default async function ClientDashboard({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const periodKey = parsePeriod((await searchParams).period);
  const supabase = await createClient();

  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();

  if (!clientRecord) redirect("/client");

  const today = todayISO();
  const in7 = addDaysISO(today, 7);
  const in30 = addDaysISO(today, 30);
  // The KPI row stays on this month; the payout chart follows this window.
  const period = periodRange(periodKey, today);

  const { year, month0 } = parseMonthParam(undefined);
  const days = getMonthGrid(year, month0)
    .filter((c) => c.date !== null)
    .map((c) => c.date as string);
  const monthStart = days[0];
  const monthEnd = days[days.length - 1];

  const { year: prevYear, month0: prevMonth0 } = addMonths(year, month0, -1);
  const prevDays = getMonthGrid(prevYear, prevMonth0)
    .filter((c) => c.date !== null)
    .map((c) => c.date as string);
  const prevStart = prevDays[0];
  const prevEnd = prevDays[prevDays.length - 1];

  const bookingFields =
    "id, guest_name, check_in, check_out, source, status, sale_price, client_payout, settled, booking_properties(property_id, properties(name))";

  const [
    { data: properties },
    { data: monthBookings },
    { data: prevBookings },
    { data: activityRows },
    { data: blocks },
    { data: periodBookings },
    { data: prevPeriodBookings },
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id, created_at")
      .eq("client_id", clientRecord.id)
      .eq("status", "active"),
    supabase
      .from("bookings")
      .select(bookingFields)
      .eq("client_id", clientRecord.id)
      .neq("status", "cancelled")
      .lte("check_in", monthEnd)
      .gte("check_out", monthStart),
    supabase
      .from("bookings")
      .select("sale_price, client_payout")
      .eq("client_id", clientRecord.id)
      .neq("status", "cancelled")
      .lte("check_in", prevEnd)
      .gte("check_out", prevStart),
    supabase
      .from("bookings")
      .select(bookingFields)
      .eq("client_id", clientRecord.id)
      .neq("status", "cancelled")
      .gte("check_out", today)
      .lte("check_in", in30)
      .order("check_in"),
    supabase
      .from("calendar_blocks")
      .select("property_id, start_date, end_date, block_type")
      .lte("start_date", monthEnd)
      .gte("end_date", monthStart),
    supabase
      .from("bookings")
      .select("check_in, client_payout")
      .eq("client_id", clientRecord.id)
      .neq("status", "cancelled")
      .lte("check_in", period.end)
      .gte("check_out", period.start),
    supabase
      .from("bookings")
      .select("client_payout")
      .eq("client_id", clientRecord.id)
      .neq("status", "cancelled")
      .lte("check_in", period.prevEnd)
      .gte("check_out", period.prevStart),
  ]);

  // ── Money ──────────────────────────────────────────────────────────────────
  // Same overlap window the Bookings & Payouts page uses, so the two never disagree.
  const rows = (monthBookings ?? []) as unknown as BookingRow[];
  const grossThisMonth = rows.reduce((s, b) => s + Number(b.sale_price ?? 0), 0);
  const payoutThisMonth = rows.reduce((s, b) => s + Number(b.client_payout ?? 0), 0);
  const grossLastMonth = (prevBookings ?? []).reduce((s, b) => s + Number(b.sale_price ?? 0), 0);
  const payoutLastMonth = (prevBookings ?? []).reduce((s, b) => s + Number(b.client_payout ?? 0), 0);
  const awaiting = ((monthBookings ?? []) as unknown as { client_payout: number | null; settled: boolean }[])
    .reduce((s, b) => s + (b.settled ? 0 : Number(b.client_payout ?? 0)), 0);

  // Cumulative daily series: each booking lands on its check-in day (clamped into
  // the month), so the last point equals the month total on the KPI card.
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const payoutPerDay = new Array(days.length).fill(0);
  const grossPerDay = new Array(days.length).fill(0);
  for (const b of rows) {
    const i = dayIndex.get(b.check_in > monthStart ? b.check_in : monthStart) ?? 0;
    payoutPerDay[i] += Number(b.client_payout ?? 0);
    grossPerDay[i] += Number(b.sale_price ?? 0);
  }
  const cumulate = (arr: number[]) => arr.map(((sum) => (v: number) => (sum += v))(0));
  const payoutSeries = cumulate(payoutPerDay);
  const grossSeries = cumulate(grossPerDay);

  // Same shape again over whichever window the period select is on.
  const periodPayout = (periodBookings ?? []).reduce(
    (s, b) => s + Number(b.client_payout ?? 0),
    0
  );
  const prevPeriodPayout = (prevPeriodBookings ?? []).reduce(
    (s, b) => s + Number(b.client_payout ?? 0),
    0
  );
  const periodIndex = new Map(period.days.map((d, i) => [d, i]));
  const periodPerDay = new Array(period.days.length).fill(0);
  for (const b of periodBookings ?? []) {
    const i = periodIndex.get(b.check_in > period.start ? b.check_in : period.start) ?? 0;
    periodPerDay[i] += Number(b.client_payout ?? 0);
  }
  const periodSeries = cumulate(periodPerDay);

  // ── Occupancy ──────────────────────────────────────────────────────────────
  // Booking check_out is exclusive; calendar_blocks.end_date is inclusive.
  const activeIds = new Set((properties ?? []).map((p) => p.id));
  const occupiedCells = new Set<string>();
  const blockedCells = new Set<string>();

  for (const b of rows) {
    const ids = ((b.booking_properties as { property_id: string }[] | null) ?? [])
      .map((bp) => bp.property_id)
      .filter((id) => activeIds.has(id));
    if (ids.length === 0) continue;
    for (
      let d = b.check_in > monthStart ? b.check_in : monthStart;
      d < b.check_out && d <= monthEnd;
      d = addDaysISO(d, 1)
    ) {
      for (const id of ids) occupiedCells.add(`${id}|${d}`);
    }
  }

  for (const bl of blocks ?? []) {
    if (!activeIds.has(bl.property_id)) continue;
    const target = bl.block_type === "booked" ? occupiedCells : blockedCells;
    for (
      let d = bl.start_date > monthStart ? bl.start_date : monthStart;
      d <= bl.end_date && d <= monthEnd;
      d = addDaysISO(d, 1)
    ) {
      target.add(`${bl.property_id}|${d}`);
    }
  }

  const activeCount = activeIds.size;
  const totalNights = activeCount * days.length;
  const occupancyByDay = days.map((d) => {
    let sold = 0;
    for (const id of activeIds) if (occupiedCells.has(`${id}|${d}`)) sold++;
    return activeCount > 0 ? (sold / activeCount) * 100 : 0;
  });
  const nightsSold = occupiedCells.size;
  const nightsBlocked = [...blockedCells].filter((k) => !occupiedCells.has(k)).length;
  const nightsAvailable = totalNights - nightsSold - nightsBlocked;
  const pctOf = (n: number) => (totalNights > 0 ? Math.round((n / totalNights) * 100) : 0);
  const occupancyPct = pctOf(nightsSold);

  const propertyCreatedAt = (properties ?? []).map((p) => String(p.created_at).slice(0, 10)).sort();
  const propertySeries = days.map((d) => propertyCreatedAt.filter((c) => c <= d).length);

  // ── Activity ───────────────────────────────────────────────────────────────
  const activity: ActivityBooking[] = ((activityRows ?? []) as unknown as BookingRow[]).map((b) => ({
    id: b.id,
    guestName: b.guest_name,
    clientName: clientRecord.name,
    units: unitNames(b),
    checkIn: b.check_in,
    checkOut: b.check_out,
    source: b.source,
    status: b.status,
  }));
  const upcoming = activity.filter((b) => b.checkIn >= today);
  const checkins = activity.filter((b) => b.checkIn >= today && b.checkIn <= in7);
  const checkouts = activity.filter((b) => b.checkOut >= today && b.checkOut <= in7);

  // ── Today ──────────────────────────────────────────────────────────────────
  const checkinsToday = activity.filter((b) => b.checkIn === today);
  const checkoutsToday = activity.filter((b) => b.checkOut === today);
  const inHouseTonight = activity.filter((b) => b.checkIn <= today && b.checkOut > today).length;
  const todayTiles = [
    { label: "Check-ins", value: checkinsToday.length, tint: "var(--color-positive)" },
    {
      label: "Check-outs",
      value: checkoutsToday.length,
      tint: "var(--color-hostello-purple-glow)",
    },
    { label: "In house", value: inHouseTonight, tint: "var(--color-channel-booking)" },
    { label: "Nights sold", value: nightsSold, tint: "var(--color-hostello-gold)" },
  ];
  const todayFeed = [
    ...checkinsToday.map((b) => ({ kind: "Check-in", b })),
    ...checkoutsToday.map((b) => ({ kind: "Check-out", b })),
  ];

  return (
    <div className="flex flex-col gap-4 animate-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">{clientRecord.name}</h1>
          <p className="text-sm text-ink-secondary mt-1.5">
            Your properties in {formatMonthLabel(year, month0)}.
          </p>
        </div>
        <Link
          href="/client/bookings/new"
          className="rounded-lg py-2 px-4 text-sm font-medium text-white flex items-center gap-1.5 gradient-brand transition-transform hover:scale-[1.02]"
        >
          <Plus size={15} strokeWidth={2.5} />
          Add booking
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <Kpi
          label="Active properties"
          value={String(activeCount)}
          icon={Home}
          tint="var(--color-hostello-purple-glow)"
          series={propertySeries}
          sparkId="c-props"
          href="/client/calendar"
        />
        <Kpi
          label="Occupancy this month"
          value={`${occupancyPct}%`}
          icon={BarChart3}
          tint="var(--color-channel-booking)"
          series={occupancyByDay}
          sparkId="c-occ"
        >
          <p className="text-[11px] text-ink-muted mt-1">
            {nightsSold} of {totalNights} nights
          </p>
        </Kpi>
        <Kpi
          label="Revenue this month"
          value={formatPKR(grossThisMonth)}
          icon={CircleDollarSign}
          tint="var(--color-channel-hostello)"
          series={grossSeries}
          sparkId="c-gross"
          href="/client/bookings"
        >
          <Delta current={grossThisMonth} previous={grossLastMonth} />
        </Kpi>
        <Kpi
          label="Your payout this month"
          value={formatPKR(payoutThisMonth)}
          icon={Wallet}
          tint="var(--color-hostello-gold)"
          iconInk="text-surface-0"
          series={payoutSeries}
          sparkId="c-payout"
          href="/client/bookings"
        >
          <Delta current={payoutThisMonth} previous={payoutLastMonth} />
        </Kpi>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        <div className="card p-5 lg:col-span-2 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">Payout overview</h2>
              <p className="text-xs text-ink-muted mt-0.5">Cumulative — {period.label}</p>
            </div>
            <PeriodSelect value={period.key} />
          </div>
          <div>
            <p className="text-xl font-semibold">{formatPKR(periodPayout)}</p>
            <Delta
              current={periodPayout}
              previous={prevPeriodPayout}
              suffix={period.compareLabel}
            />
            {awaiting > 0 && (
              <p className="text-xs text-status-pending mt-1">
                {formatPKR(awaiting)} awaiting settlement this month
              </p>
            )}
          </div>
          {periodPayout > 0 ? (
            <RevenueChart dates={period.days} series={periodSeries} />
          ) : (
            <p className="rounded-lg bg-surface-2/60 px-5 py-10 text-center text-sm text-ink-secondary">
              No payouts recorded in {period.label} yet.
            </p>
          )}
        </div>

        <div className="card p-5 flex flex-col gap-3">
          <h2 className="text-sm font-medium">Nights this month</h2>
          {totalNights === 0 ? (
            <p className="rounded-lg bg-surface-2/60 px-5 py-10 text-center text-sm text-ink-secondary">
              No active properties yet.
            </p>
          ) : (
            <div className="flex items-center gap-4">
              <OccupancyDonut
                occupied={pctOf(nightsSold)}
                blocked={pctOf(nightsBlocked)}
                available={pctOf(nightsAvailable)}
              />
              <ul className="text-xs flex flex-col gap-2">
                <li className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: "var(--color-hostello-purple-glow)" }}
                  />
                  <span className="text-ink-secondary">Booked</span>
                  <span className="text-ink-primary ml-auto">{nightsSold}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: "var(--color-status-blocked)" }}
                  />
                  <span className="text-ink-secondary">Blocked</span>
                  <span className="text-ink-primary ml-auto">{nightsBlocked}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: "var(--color-positive)" }}
                  />
                  <span className="text-ink-secondary">Available</span>
                  <span className="text-ink-primary ml-auto">{nightsAvailable}</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="card p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-medium">Today&apos;s summary</h2>
          <div className="flex items-center gap-2">
            <Link
              href="/client/checkins"
              className="text-xs text-surface-0 rounded-md px-2.5 py-1.5 font-medium flex items-center gap-1.5 transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--color-hostello-gold)" }}
            >
              <LogIn size={13} />
              Manage check-ins
            </Link>
            <Link
              href="/client/today"
              className="text-xs text-ink-secondary border border-border-hairline rounded-md px-2.5 py-1.5 hover:border-border-strong transition-colors"
            >
              Open day sheet
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {todayTiles.map((t) => (
            <Link
              key={t.label}
              href="/client/today"
              className="rounded-lg bg-surface-2/60 p-3 flex flex-col gap-1.5 border border-transparent hover:border-border-strong transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.tint }} />
              <p className="text-lg font-semibold leading-none">{t.value}</p>
              <p className="text-[11px] text-ink-muted leading-tight">{t.label}</p>
            </Link>
          ))}
        </div>

        {todayFeed.length === 0 ? (
          <p className="rounded-lg bg-surface-2/60 py-6 text-center text-sm text-ink-secondary">
            Nothing arriving or leaving today.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {todayFeed.map(({ kind, b }) => (
              <li
                key={`${kind}-${b.id}`}
                className="flex items-center gap-3 rounded-lg bg-surface-2/60 px-3 py-2.5"
              >
                <Avatar name={b.guestName} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-primary truncate">
                    {kind}: {b.units || "—"}
                  </p>
                  <p className="text-xs text-ink-secondary truncate mt-0.5">
                    Guest: {b.guestName ?? "—"}
                  </p>
                </div>
                <StatusChip status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-medium">Booking activity</h2>
          <Link
            href="/client/bookings"
            className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
          >
            All bookings →
          </Link>
        </div>
        <BookingActivity upcoming={upcoming} checkins={checkins} checkouts={checkouts} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="card p-4 flex items-center gap-3 hover:border-border-strong border border-transparent transition-colors"
          >
            <span
              className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: "var(--color-hostello-gold)" }}
            >
              <a.icon size={16} className="text-surface-0" strokeWidth={2.5} />
            </span>
            <span className="text-sm font-medium text-ink-primary">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
