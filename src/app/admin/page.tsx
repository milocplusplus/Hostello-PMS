import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Home,
  CalendarDays,
  BarChart3,
  CircleDollarSign,
  LogIn,
  LogOut,
  FilePlus2,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentProfile, currentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import { sourceLabel } from "@/lib/block-sources";
import {
  getMonthGrid,
  formatMonthLabel,
  parseMonthParam,
  addMonths,
  todayISO,
  addDaysISO,
  formatDayMonth,
} from "@/lib/calendar";
import {
  BookingActivity,
  ChannelBadge,
  type ActivityBooking,
} from "@/components/admin/BookingActivity";
import { AddBookingMenu } from "@/components/admin/AddBookingMenu";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { PeriodSelect } from "@/components/shared/PeriodSelect";
import { parsePeriod, periodRange } from "@/lib/period";
import { Avatar } from "@/components/shared/Avatar";
import { StatusChip } from "@/components/shared/StatusChip";
import { Kpi, Delta, OccupancyDonut } from "@/components/shared/Kpi";

type BookingRow = {
  id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  source: string;
  status: string;
  sale_price: number | null;
  clients: unknown;
  booking_properties: unknown;
};

function clientName(row: { clients: unknown }): string | null {
  return (row.clients as { name: string } | null)?.name ?? null;
}

function unitNames(row: { booking_properties: unknown }): string {
  return ((row.booking_properties as { properties: { name: string } | null }[] | null) ?? [])
    .map((bp) => bp.properties?.name)
    .filter(Boolean)
    .join(", ");
}

function toActivity(b: BookingRow): ActivityBooking {
  return {
    id: b.id,
    guestName: b.guest_name,
    clientName: clientName(b),
    units: unitNames(b),
    checkIn: b.check_in,
    checkOut: b.check_out,
    source: b.source,
    status: b.status,
  };
}

function greeting(): string {
  const hour = Number(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi", hour: "2-digit", hour12: false })
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const supabase = await createClient();

  const user = await currentUser();
  if (!user) redirect("/login");

  const today = todayISO();
  // The KPI row is always this month; the revenue card follows this window.
  const period = periodRange(parsePeriod((await searchParams).period), today);
  const in7 = addDaysISO(today, 7);
  const in30 = addDaysISO(today, 30);

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
    "id, guest_name, check_in, check_out, source, status, sale_price, advance_received, hostello_share, settled, created_at, clients(name), booking_properties(property_id, properties(name))";

  const [
    profile,
    { data: properties },
    { data: monthBookings },
    { data: prevBookings },
    { data: activityRows },
    { data: recentBookings },
    { data: blocks },
    { data: confirmedBookings },
    { count: createdToday },
    { data: periodBookings },
    { data: prevPeriodBookings },
  ] = await Promise.all([
    // Already fetched by the layout this request — the cache makes it free.
    currentProfile(),
    supabase.from("properties").select("id, created_at").eq("status", "active"),
    supabase
      .from("bookings")
      .select(bookingFields)
      .neq("status", "cancelled")
      .lte("check_in", monthEnd)
      .gte("check_out", monthStart),
    supabase
      .from("bookings")
      .select("sale_price")
      .neq("status", "cancelled")
      .lte("check_in", prevEnd)
      .gte("check_out", prevStart),
    supabase
      .from("bookings")
      .select(bookingFields)
      .neq("status", "cancelled")
      .gte("check_out", today)
      .lte("check_in", in30)
      .order("check_in"),
    supabase.from("bookings").select(bookingFields).order("created_at", { ascending: false }).limit(6),
    supabase
      .from("calendar_blocks")
      .select("property_id, start_date, end_date, block_type")
      .lte("start_date", monthEnd)
      .gte("end_date", monthStart),
    supabase.from("bookings").select("sale_price, advance_received").eq("status", "confirmed"),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .gte("created_at", `${today}T00:00:00Z`),
    supabase
      .from("bookings")
      .select("check_in, sale_price")
      .neq("status", "cancelled")
      .lte("check_in", period.end)
      .gte("check_out", period.start),
    supabase
      .from("bookings")
      .select("sale_price")
      .neq("status", "cancelled")
      .lte("check_in", period.prevEnd)
      .gte("check_out", period.prevStart),
  ]);

  // ── Revenue ────────────────────────────────────────────────────────────────
  // Same overlap window the Bookings & Payouts page uses, so the two never disagree.
  const grossThisMonth = (monthBookings ?? []).reduce((s, b) => s + Number(b.sale_price ?? 0), 0);
  const grossLastMonth = (prevBookings ?? []).reduce((s, b) => s + Number(b.sale_price ?? 0), 0);
  const awaiting = (monthBookings ?? []).reduce(
    (s, b) => s + (b.settled ? 0 : Number(b.hostello_share ?? 0)),
    0
  );

  // Cumulative daily series: each booking lands on its check-in day (clamped into
  // the month), so the last point equals the month total shown on the KPI card.
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const revenuePerDay = new Array(days.length).fill(0);
  const bookingsPerDay = new Array(days.length).fill(0);
  for (const b of (monthBookings ?? []) as unknown as BookingRow[]) {
    const i = dayIndex.get(b.check_in > monthStart ? b.check_in : monthStart) ?? 0;
    revenuePerDay[i] += Number(b.sale_price ?? 0);
    bookingsPerDay[i] += 1;
  }
  const cumulate = (arr: number[]) => arr.map(((sum) => (v: number) => (sum += v))(0));
  const revenueSeries = cumulate(revenuePerDay);
  const bookingSeries = cumulate(bookingsPerDay);

  // Same shape again over whichever window the period select is on.
  const periodGross = (periodBookings ?? []).reduce((s, b) => s + Number(b.sale_price ?? 0), 0);
  const prevPeriodGross = (prevPeriodBookings ?? []).reduce(
    (s, b) => s + Number(b.sale_price ?? 0),
    0
  );
  const periodIndex = new Map(period.days.map((d, i) => [d, i]));
  const periodPerDay = new Array(period.days.length).fill(0);
  for (const b of periodBookings ?? []) {
    const i = periodIndex.get(b.check_in > period.start ? b.check_in : period.start) ?? 0;
    periodPerDay[i] += Number(b.sale_price ?? 0);
  }
  const periodSeries = cumulate(periodPerDay);

  // ── Occupancy ──────────────────────────────────────────────────────────────
  // Booking check_out is exclusive; calendar_blocks.end_date is inclusive.
  const activeIds = new Set((properties ?? []).map((p) => p.id));
  const occupiedCells = new Set<string>();
  const blockedCells = new Set<string>();

  for (const b of (monthBookings ?? []) as unknown as BookingRow[]) {
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

  // ── Properties ─────────────────────────────────────────────────────────────
  const propertyCreatedAt = (properties ?? []).map((p) => String(p.created_at).slice(0, 10)).sort();
  const addedThisMonth = propertyCreatedAt.filter((d) => d >= monthStart).length;
  const propertySeries = days.map((d) => propertyCreatedAt.filter((c) => c <= d).length);

  // ── Activity + today ───────────────────────────────────────────────────────
  const activity = ((activityRows ?? []) as unknown as BookingRow[]).map(toActivity);
  const upcoming = activity.filter((b) => b.checkIn >= today);
  const checkins = activity.filter((b) => b.checkIn >= today && b.checkIn <= in7);
  const checkouts = activity.filter((b) => b.checkOut >= today && b.checkOut <= in7);

  const checkinsToday = activity.filter((b) => b.checkIn === today);
  const checkoutsToday = activity.filter((b) => b.checkOut === today);
  const pendingPayments = (confirmedBookings ?? []).filter(
    (b) => Number(b.advance_received ?? 0) < Number(b.sale_price ?? 0)
  ).length;

  const todayTiles = [
    {
      label: "Check-ins",
      value: checkinsToday.length,
      icon: LogIn,
      tint: "var(--color-positive)",
      // These two are jobs, not just counts — send them where they get ticked.
      href: "/admin/checkins",
    },
    {
      label: "Check-outs",
      value: checkoutsToday.length,
      icon: LogOut,
      tint: "var(--color-hostello-purple-glow)",
      href: "/admin/checkins",
    },
    {
      label: "New bookings",
      value: createdToday ?? 0,
      icon: FilePlus2,
      tint: "var(--color-channel-booking)",
      href: "/admin/bookings",
    },
    {
      label: "Payments pending",
      value: pendingPayments,
      icon: Clock,
      tint: "var(--color-status-pending)",
      href: "/admin/today",
    },
  ];

  const todayFeed = [
    ...checkinsToday.map((b) => ({ kind: "Check-in", b })),
    ...checkoutsToday.map((b) => ({ kind: "Check-out", b })),
  ];

  return (
    <div className="flex flex-col gap-4 animate-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">
            {greeting()}
            {profile?.full_name ? `, ${profile.full_name}` : ""} 👋
          </h1>
          <p className="text-sm text-ink-secondary mt-1.5">
            Here&apos;s what&apos;s happening across your portfolio today.
          </p>
        </div>
        <AddBookingMenu />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi
          label="Properties"
          value={String(activeCount)}
          icon={Home}
          tint="var(--color-hostello-purple-glow)"
          series={propertySeries}
          sparkId="spark-properties"
          href="/admin/clients"
        >
          <p className="text-[11px] text-ink-muted mt-1">
            {addedThisMonth > 0 ? `+${addedThisMonth} this month` : "None added this month"}
          </p>
        </Kpi>

        <Kpi
          label="Bookings"
          value={String((monthBookings ?? []).length)}
          icon={CalendarDays}
          tint="var(--color-channel-booking)"
          series={bookingSeries}
          sparkId="spark-bookings"
          href="/admin/bookings"
        >
          <Delta current={(monthBookings ?? []).length} previous={(prevBookings ?? []).length} />
        </Kpi>

        <Kpi
          label="Occupancy"
          value={activeCount === 0 ? "—" : `${occupancyPct}%`}
          icon={BarChart3}
          tint="var(--color-positive)"
          iconInk="text-surface-0"
          series={occupancyByDay}
          sparkId="spark-occupancy"
        >
          <p className="text-[11px] text-ink-muted mt-1">
            {activeCount === 0
              ? "Add a property to track occupancy"
              : `${nightsSold} of ${totalNights} nights sold`}
          </p>
        </Kpi>

        <Kpi
          label={`Revenue (${formatMonthLabel(year, month0).split(" ")[0]})`}
          value={formatPKR(grossThisMonth)}
          icon={CircleDollarSign}
          tint="var(--color-hostello-gold)"
          iconInk="text-surface-0"
          series={revenueSeries}
          sparkId="spark-revenue"
          href="/admin/bookings"
        >
          <Delta current={grossThisMonth} previous={grossLastMonth} />
        </Kpi>
      </div>

      <div className="grid xl:grid-cols-2 gap-4 items-start">
        <div className="flex flex-col gap-4">
          <section className="card p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-medium">Booking activity</h2>
              <Link
                href="/admin/bookings"
                className="text-xs text-ink-secondary border border-border-hairline rounded-md px-2.5 py-1.5 hover:border-border-strong transition-colors"
              >
                View all
              </Link>
            </div>
            <BookingActivity upcoming={upcoming} checkins={checkins} checkouts={checkouts} />
          </section>

          <section className="card p-5 flex flex-col gap-4">
            <h2 className="text-base font-medium">Occupancy</h2>
            {activeCount === 0 ? (
              <p className="py-10 text-center text-sm text-ink-secondary">
                No active properties yet — occupancy starts once you add one.
              </p>
            ) : (
              <div className="flex items-center gap-6 flex-wrap justify-center sm:justify-start">
                <div className="relative">
                  <OccupancyDonut
                    occupied={pctOf(nightsSold)}
                    blocked={pctOf(nightsBlocked)}
                    available={pctOf(nightsAvailable)}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-2xl font-semibold">{occupancyPct}%</p>
                    <p className="text-[10px] text-ink-muted mt-0.5">Occupancy rate</p>
                  </div>
                </div>
                <ul className="flex flex-col gap-2.5 text-sm min-w-[180px]">
                  {[
                    { label: "Occupied", n: nightsSold, color: "var(--color-hostello-purple-glow)" },
                    { label: "Blocked", n: nightsBlocked, color: "var(--color-status-blocked)" },
                    { label: "Available", n: nightsAvailable, color: "var(--color-positive)" },
                  ].map((s) => (
                    <li key={s.label} className="flex items-center justify-between gap-6">
                      <span className="flex items-center gap-2 text-ink-secondary">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        {s.label}
                      </span>
                      <span className="text-ink-primary">{pctOf(s.n)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="card p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-medium">Revenue overview</h2>
              <PeriodSelect value={period.key} />
            </div>
            <div>
              <p className="text-2xl font-semibold">{formatPKR(periodGross)}</p>
              <Delta
                current={periodGross}
                previous={prevPeriodGross}
                suffix={period.compareLabel}
              />
              <p className="text-[11px] text-ink-muted mt-1">{period.label}</p>
            </div>
            {periodGross === 0 ? (
              <p className="py-12 text-center text-sm text-ink-secondary">
                No revenue recorded in {period.label} yet.
              </p>
            ) : (
              <RevenueChart dates={period.days} series={periodSeries} />
            )}
          </section>

          <section className="card p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-base font-medium">Today&apos;s summary</h2>
              <div className="flex items-center gap-2">
                <Link
                  href="/admin/checkins"
                  className="text-xs text-surface-0 rounded-md px-2.5 py-1.5 font-medium flex items-center gap-1.5 transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "var(--color-hostello-gold)" }}
                >
                  <LogIn size={13} />
                  Manage check-ins
                </Link>
                <Link
                  href="/admin/today"
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
                  href={t.href}
                  className="rounded-lg bg-surface-2/60 p-3 flex flex-col gap-1.5 border border-transparent hover:border-border-strong transition-colors"
                >
                  <span
                    className="w-7 h-7 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: `color-mix(in srgb, ${t.tint} 20%, transparent)` }}
                  >
                    <t.icon size={14} style={{ color: t.tint }} />
                  </span>
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
                        {kind}: {b.units || b.clientName || "—"}
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

            {awaiting > 0 && (
              <p className="text-xs text-ink-muted border-t border-border-hairline pt-3">
                <span className="text-status-pending font-medium">{formatPKR(awaiting)}</span> in Hostello
                share still awaiting settlement this month.
              </p>
            )}
          </section>
        </div>
      </div>

      <section className="card p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-medium">Recent bookings</h2>
          <Link
            href="/admin/bookings"
            className="text-xs text-ink-secondary border border-border-hairline rounded-md px-2.5 py-1.5 hover:border-border-strong transition-colors"
          >
            View all bookings
          </Link>
        </div>

        {!recentBookings || recentBookings.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-secondary">
            No bookings recorded yet.
            <div className="mt-3">
              <Link href="/admin/bookings/new" className="text-hostello-gold hover:underline">
                Add the first one →
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed md:table-auto md:min-w-[720px]">
              <thead>
                <tr className="text-left text-ink-muted text-xs border-b border-border-hairline">
                  <th className="pb-3 pr-4 font-normal">Guest</th>
                  <th className="pb-3 pr-4 font-normal hidden md:table-cell">Property</th>
                  <th className="pb-3 pr-4 font-normal hidden md:table-cell">Dates</th>
                  <th className="pb-3 pr-4 font-normal hidden md:table-cell">Source</th>
                  <th className="pb-3 pr-4 font-normal hidden md:table-cell">Total</th>
                  {/* Fixed layout on a phone: this width is what leaves the guest
                      column the rest of the card instead of overflowing it. */}
                  <th className="pb-3 font-normal w-[92px] md:w-auto">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-hairline)]">
                {(recentBookings as unknown as BookingRow[]).map((b) => (
                  <tr key={b.id}>
                    <td className="py-3 pr-4">
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={b.guest_name} size={28} />
                        <span className="min-w-0">
                          <span className="block text-ink-primary truncate">
                            {b.guest_name ?? "Guest"}
                          </span>
                          {/* The columns that get hidden on a phone, folded into the row itself */}
                          <span className="md:hidden block text-xs text-ink-secondary truncate mt-0.5">
                            {unitNames(b) || clientName(b) || "—"}
                          </span>
                          <span className="md:hidden flex items-center gap-1.5 flex-wrap text-xs mt-1">
                            <ChannelBadge source={b.source} />
                            <span className="text-ink-secondary">
                              {formatDayMonth(b.check_in)} – {formatDayMonth(b.check_out)}
                            </span>
                            <span className="text-ink-primary">
                              {formatPKR(Number(b.sale_price ?? 0))}
                            </span>
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-ink-secondary hidden md:table-cell">
                      {unitNames(b) || clientName(b) || "—"}
                    </td>
                    <td className="py-3 pr-4 text-ink-secondary whitespace-nowrap hidden md:table-cell">
                      {formatDayMonth(b.check_in)} – {formatDayMonth(b.check_out)}
                    </td>
                    <td className="py-3 pr-4 text-ink-secondary hidden md:table-cell">
                      <span className="flex items-center gap-1.5">
                        <ChannelBadge source={b.source} />
                        {sourceLabel(b.source) ?? b.source}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-ink-primary whitespace-nowrap hidden md:table-cell">
                      {formatPKR(Number(b.sale_price ?? 0))}
                    </td>
                    <td className="py-3">
                      <StatusChip status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
