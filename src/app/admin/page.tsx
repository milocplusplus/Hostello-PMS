import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CalendarPlus, ChartNoAxesColumn, Clock, Inbox, Plus } from "lucide-react";
import { EmptyState } from "@/components/shared/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { canSeeSplit, currentProfile, currentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import {
  getMonthGrid,
  formatMonthLabel,
  parseMonthParam,
  addMonths,
  todayISO,
  addDaysISO,
} from "@/lib/calendar";
import type { ActivityBooking } from "@/components/admin/BookingActivity";
import { AddBookingMenu } from "@/components/admin/AddBookingMenu";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { PeriodSelect } from "@/components/shared/PeriodSelect";
import { parsePeriod, periodRange } from "@/lib/period";
import { firstUnitPhoto } from "@/lib/property-photos";
import { Avatar } from "@/components/shared/Avatar";
import { Delta } from "@/components/shared/Kpi";
import { CountUp } from "@/components/shared/CountUp";
import { InfoSheet } from "@/components/shared/InfoSheet";
import {
  HeroChange,
  HeroStat,
  HeroTrend,
  OccupancyRing,
  StatTile,
  StayRow,
  TodayStories,
} from "@/components/shared/DashboardBits";
import { staffMay } from "@/lib/settings";

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
    "id, guest_name, check_in, check_out, source, status, sale_price, advance_received, hostello_share, due_to_hostello, share_received, created_at, clients:clients_v(name), booking_properties(property_id, properties:properties_v(name, photo_path))";

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
    supabase.from("properties_v").select("id").eq("bookable", true),
    supabase
      .from("bookings_v")
      .select(bookingFields)
      .neq("status", "cancelled")
      .lte("check_in", monthEnd)
      .gt("check_out", monthStart),
    supabase
      .from("bookings_v")
      .select("sale_price")
      .eq("status", "confirmed")
      .gte("check_in", prevStart)
      .lte("check_in", prevEnd),
    supabase
      .from("bookings_v")
      .select(bookingFields)
      .neq("status", "cancelled")
      .gte("check_out", today)
      .lte("check_in", in30)
      .order("check_in"),
    supabase.from("bookings_v").select(bookingFields).order("created_at", { ascending: false }).limit(6),
    supabase
      .from("calendar_blocks")
      .select("property_id, start_date, end_date, block_type")
      .lte("start_date", monthEnd)
      .gte("end_date", monthStart),
    supabase.from("bookings_v").select("sale_price, advance_received").eq("status", "confirmed"),
    supabase
      .from("bookings_v")
      .select("*", { count: "exact", head: true })
      .gte("created_at", `${today}T00:00:00Z`),
    supabase
      .from("bookings_v")
      .select("check_in, sale_price")
      .eq("status", "confirmed")
      .gte("check_in", period.start)
      .lte("check_in", period.end),
    supabase
      .from("bookings_v")
      .select("sale_price")
      .eq("status", "confirmed")
      .gte("check_in", period.prevStart)
      .lte("check_in", period.prevEnd),
  ]);

  // ── Revenue ────────────────────────────────────────────────────────────────
  // A confirmed stay counts whole in the month it checks in — the rule Stats and
  // the Profit tab use; a tentative stay is not money made. `monthBookings` is
  // the overlap window, tentative included, because occupancy needs every night
  // held in the month; the money is the confirmed part of it that checked in.
  const monthStays = (monthBookings ?? []).filter(
    (b) => b.status === "confirmed" && b.check_in >= monthStart
  );
  const grossThisMonth = monthStays.reduce((s, b) => s + Number(b.sale_price ?? 0), 0);
  const grossLastMonth = (prevBookings ?? []).reduce((s, b) => s + Number(b.sale_price ?? 0), 0);
  const awaiting = monthStays.reduce(
    (s, b) => s + (b.share_received ? 0 : Number(b.due_to_hostello ?? 0)),
    0
  );

  // Cumulative daily series: each booking lands on its check-in day, so the last
  // point equals the month total shown on the KPI card.
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const revenuePerDay = new Array(days.length).fill(0);
  const bookingsPerDay = new Array(days.length).fill(0);
  for (const b of monthStays as unknown as BookingRow[]) {
    const i = dayIndex.get(b.check_in) ?? 0;
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
    const i = periodIndex.get(b.check_in) ?? 0;
    periodPerDay[i] += Number(b.sale_price ?? 0);
  }
  const periodSeries = cumulate(periodPerDay);

  // ── Occupancy ──────────────────────────────────────────────────────────────
  // Booking check_out is exclusive; calendar_blocks.end_date is inclusive.
  const activeIds = new Set((properties ?? []).map((p) => p.id));
  const occupiedCells = new Set<string>();

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
    // Only a "booked" block sells a night; a plain block just holds it.
    if (!activeIds.has(bl.property_id) || bl.block_type !== "booked") continue;
    for (
      let d = bl.start_date > monthStart ? bl.start_date : monthStart;
      d <= bl.end_date && d <= monthEnd;
      d = addDaysISO(d, 1)
    ) {
      occupiedCells.add(`${bl.property_id}|${d}`);
    }
  }

  const activeCount = activeIds.size;
  const totalNights = activeCount * days.length;
  const nightsSold = occupiedCells.size;
  const occupancyPct = totalNights > 0 ? Math.round((nightsSold / totalNights) * 100) : 0;

  // ── Activity + today ───────────────────────────────────────────────────────
  const activity = ((activityRows ?? []) as unknown as BookingRow[]).map(toActivity);
  const pendingPayments = (confirmedBookings ?? []).filter(
    (b) => Number(b.advance_received ?? 0) < Number(b.sale_price ?? 0)
  ).length;

  // Ops gets the same day, minus the earnings: no revenue headline, no share
  // awaiting settlement, no route into client deal terms.
  const showMoney = canSeeSplit(profile?.role);
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? null;
  const monthName = formatMonthLabel(year, month0).split(" ")[0];
  const upcomingRows = ((activityRows ?? []) as unknown as BookingRow[])
    .filter((b) => b.check_in > today)
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-6 stagger">
      <header className="relative z-20 flex items-center gap-3">
        <Avatar name={profile?.full_name ?? "Hostello"} size={46} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-ink-secondary">{greeting()}</p>
          <h1 className="text-xl md:text-2xl truncate">{firstName ?? "Hostello"}</h1>
        </div>
        <AddBookingMenu isOwner={showMoney} canBlock={await staffMay("block")} />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <section className="card-hero lg:col-span-3 p-5 md:p-6 flex flex-col gap-1.5">
          {showMoney ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-white/85">Revenue · {monthName}</span>
                <InfoSheet title="Revenue" className="bg-white/20 text-white">
                  <p>What guests paid for confirmed stays checking in this month, across every client.</p>
                  <p>
                    Share awaiting is Hostello&apos;s part of those stays that an owner still has to send
                    — stays whose money the owner received.
                  </p>
                </InfoSheet>
              </div>
              <p className="num flex items-baseline gap-2">
                <span className="text-base font-bold text-white/85">Rs</span>
                <span className="text-[44px] md:text-5xl font-extrabold leading-none">
                  <CountUp value={grossThisMonth} />
                </span>
              </p>
              <HeroChange current={grossThisMonth} previous={grossLastMonth} />
              <HeroTrend series={revenueSeries} id="admin-revenue" />
              <div className="grid grid-cols-2 gap-2.5 mt-2">
                <HeroStat label="Stays" value={monthStays.length} />
                <HeroStat label="Share awaiting" value={awaiting} />
              </div>
            </>
          ) : (
            <>
              <span className="text-[13px] font-bold text-white/85">Stays · {monthName}</span>
              <p className="num text-[44px] md:text-5xl font-extrabold leading-none">
                <CountUp value={monthStays.length} />
              </p>
              <HeroChange current={monthStays.length} previous={(prevBookings ?? []).length} />
              <HeroTrend series={bookingSeries} id="admin-stays" />
              <div className="grid grid-cols-2 gap-2.5 mt-2">
                <HeroStat label="Nights sold" value={nightsSold} />
                <HeroStat label="New today" value={createdToday ?? 0} />
              </div>
            </>
          )}
        </section>

        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          <OccupancyRing pct={activeCount === 0 ? null : occupancyPct} href="/admin/calendar" />
          <StatTile
            href={showMoney ? "/admin/clients" : "/admin/calendar"}
            icon={Building2}
            tint="bg-violet-500/20 text-violet-300"
            value={activeCount}
            label="Properties"
          />
          <StatTile
            href="/admin/today"
            icon={Clock}
            tint="bg-amber-300/15 text-status-pending"
            value={pendingPayments}
            label="Balance due"
            valueClass="text-status-pending"
          />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg flex items-center gap-2">Today <span aria-hidden className="animate-pulse-dot w-2 h-2 rounded-full bg-status-available shadow-[0_0_10px_var(--color-status-available)]" /></h2>
          <div className="flex items-center gap-4 text-[13px] font-bold text-hostello-purple-light">
            <Link href="/admin/checkins">Check-ins</Link>
            <Link href="/admin/today">Day sheet</Link>
          </div>
        </div>
        <TodayStories stays={activity} today={today} hrefBase="/admin/bookings" />
      </section>

      <div className="grid xl:grid-cols-2 gap-6 items-start">
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Coming up</h2>
            <Link href="/admin/bookings" className="text-[13px] font-bold text-hostello-purple-light">
              All
            </Link>
          </div>
          {upcomingRows.length === 0 ? (
            <EmptyState icon={CalendarPlus} title="Nothing booked in the next 30 days." />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {upcomingRows.map((b) => (
                <li key={b.id}>
                  <StayRow
                    href={`/admin/bookings/${b.id}`}
                    guestName={b.guest_name}
                    units={unitNames(b)}
                    subtitle={clientName(b)}
                    checkIn={b.check_in}
                    checkOut={b.check_out}
                    source={b.source}
                    photo={firstUnitPhoto(b.booking_properties)}
                    amount={b.sale_price === null ? null : Number(b.sale_price)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {showMoney && (
          <section className="card p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg">Revenue</h2>
              <PeriodSelect value={period.key} />
            </div>
            <div>
              <p className="num text-2xl font-extrabold text-hostello-gold-bright">{formatPKR(periodGross)}</p>
              <Delta current={periodGross} previous={prevPeriodGross} suffix={period.compareLabel} />
            </div>
            {periodGross === 0 ? (
              <EmptyState inset icon={ChartNoAxesColumn} title={`No revenue in ${period.label}.`} />
            ) : (
              <RevenueChart dates={period.days} series={periodSeries} />
            )}
          </section>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Recently added</h2>
          <Link href="/admin/bookings" className="text-[13px] font-bold text-hostello-purple-light">
            All
          </Link>
        </div>
        {!recentBookings || recentBookings.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No bookings yet."
            action={
              <Link href="/admin/bookings/new" className="btn btn-primary">
                <Plus size={16} strokeWidth={2.5} />
                New booking
              </Link>
            }
          />
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {(recentBookings as unknown as BookingRow[]).map((b) => (
              <li key={b.id}>
                <StayRow
                  href={`/admin/bookings/${b.id}`}
                  guestName={b.guest_name}
                  units={unitNames(b)}
                  subtitle={clientName(b)}
                  checkIn={b.check_in}
                  checkOut={b.check_out}
                  source={b.source}
                  photo={firstUnitPhoto(b.booking_properties)}
                  amount={b.sale_price === null ? null : Number(b.sale_price)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
