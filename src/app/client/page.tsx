import Link from "next/link";
import { redirect } from "next/navigation";
import { BedDouble, CalendarPlus, Plus, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentProfile, currentUser, viewingAs } from "@/lib/auth";
import { formatPKR, isPassThroughSource } from "@/lib/payout";
import {
  getMonthGrid,
  formatMonthLabel,
  parseMonthParam,
  addMonths,
  todayISO,
  addDaysISO,
} from "@/lib/calendar";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { Delta } from "@/components/shared/Kpi";
import { PeriodSelect } from "@/components/shared/PeriodSelect";
import { Avatar } from "@/components/shared/Avatar";
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
import { parsePeriod, periodRange } from "@/lib/period";
import { firstUnitPhoto } from "@/lib/property-photos";

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

  const [clientRecord, profile, viewAs] = await Promise.all([
    currentClient(),
    currentProfile(),
    viewingAs(),
  ]);

  if (!clientRecord) redirect("/client");

  const today = todayISO();
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
    "id, guest_name, check_in, check_out, source, status, sale_price, client_payout, settled, booking_properties(property_id, properties(name, photo_path))";

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
      .select("id")
      .eq("client_id", clientRecord.id)
      .eq("status", "active"),
    supabase
      .from("bookings_v")
      .select(bookingFields)
      .eq("client_id", clientRecord.id)
      .neq("status", "cancelled")
      .lte("check_in", monthEnd)
      .gt("check_out", monthStart),
    supabase
      .from("bookings_v")
      .select("client_payout")
      .eq("client_id", clientRecord.id)
      .eq("status", "confirmed")
      .gte("check_in", prevStart)
      .lte("check_in", prevEnd),
    supabase
      .from("bookings_v")
      .select(bookingFields)
      .eq("client_id", clientRecord.id)
      .neq("status", "cancelled")
      .gte("check_out", today)
      .lte("check_in", in30)
      .order("check_in"),
    supabase
      .from("calendar_blocks")
      .select("property_id, start_date, end_date, block_type, properties!inner(client_id)")
      .eq("properties.client_id", clientRecord.id)
      .lte("start_date", monthEnd)
      .gte("end_date", monthStart),
    supabase
      .from("bookings_v")
      .select("check_in, client_payout")
      .eq("client_id", clientRecord.id)
      .eq("status", "confirmed")
      .gte("check_in", period.start)
      .lte("check_in", period.end),
    supabase
      .from("bookings_v")
      .select("client_payout")
      .eq("client_id", clientRecord.id)
      .eq("status", "confirmed")
      .gte("check_in", period.prevStart)
      .lte("check_in", period.prevEnd),
  ]);

  // ── Money ──────────────────────────────────────────────────────────────────
  // A confirmed stay counts whole in the month it checks in — the rule Stats and
  // the Profit tab use; a tentative stay is not money made. `rows` is the
  // overlap window, tentative included, because occupancy needs every night held
  // in the month; the money is the confirmed part of it that checked in.
  const rows = (monthBookings ?? []) as unknown as BookingRow[];
  const monthStays = rows.filter((b) => b.status === "confirmed" && b.check_in >= monthStart);
  const grossThisMonth = monthStays.reduce((s, b) => s + Number(b.sale_price ?? 0), 0);
  const payoutThisMonth = monthStays.reduce((s, b) => s + Number(b.client_payout ?? 0), 0);
  const payoutLastMonth = (prevBookings ?? []).reduce((s, b) => s + Number(b.client_payout ?? 0), 0);
  // Only what Hostello actually has to send: on a booking the owner sourced
  // themselves they already hold the guest's money, so it is not awaited.
  const awaiting = (
    monthStays as unknown as {
      source: string;
      client_payout: number | null;
      settled: boolean;
    }[]
  ).reduce(
    (s, b) => s + (b.settled || isPassThroughSource(b.source) ? 0 : Number(b.client_payout ?? 0)),
    0
  );

  // Cumulative daily series: each booking lands on its check-in day, so the last
  // point equals the month total on the KPI card.
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const payoutPerDay = new Array(days.length).fill(0);
  for (const b of monthStays) {
    const i = dayIndex.get(b.check_in) ?? 0;
    payoutPerDay[i] += Number(b.client_payout ?? 0);
  }
  const cumulate = (arr: number[]) => arr.map(((sum) => (v: number) => (sum += v))(0));
  const payoutSeries = cumulate(payoutPerDay);

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
    const i = periodIndex.get(b.check_in) ?? 0;
    periodPerDay[i] += Number(b.client_payout ?? 0);
  }
  const periodSeries = cumulate(periodPerDay);

  // ── Occupancy ──────────────────────────────────────────────────────────────
  // Booking check_out is exclusive; calendar_blocks.end_date is inclusive.
  const activeIds = new Set((properties ?? []).map((p) => p.id));
  const occupiedCells = new Set<string>();

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

  // ── Activity ───────────────────────────────────────────────────────────────
  const activityStays = (activityRows ?? []) as unknown as BookingRow[];
  const activity = activityStays.map((b) => ({
    id: b.id,
    guestName: b.guest_name,
    checkIn: b.check_in,
    checkOut: b.check_out,
  }));
  const comingUp = activityStays.filter((b) => b.check_in > today).slice(0, 4);

  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Karachi" }).format(
      new Date()
    )
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  // Viewing as an owner, greet the owner — not the admin who is looking.
  const displayName = (viewAs ? null : profile?.full_name) ?? clientRecord.name;
  const firstName = displayName.trim().split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-6 stagger">
      <header className="flex items-center gap-3">
        <Avatar name={displayName} size={46} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-ink-secondary">{greeting}</p>
          <h1 className="text-xl md:text-2xl truncate">{firstName}</h1>
        </div>
        <Link
          href="/client/bookings/new"
          aria-label="New booking"
          className="md:hidden btn btn-primary w-12 h-12 p-0 rounded-2xl"
        >
          <Plus size={22} strokeWidth={2.5} />
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <section className="card-hero lg:col-span-3 p-5 md:p-6 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-white/85">
              Payout · {formatMonthLabel(year, month0)}
            </span>
            <InfoSheet title="Your payout" className="bg-white/20 text-white">
              <p>Your share of confirmed stays checking in this month.</p>
              <dl className="num flex flex-col gap-2 text-[15px]">
                <div className="flex justify-between">
                  <dt>Gross</dt>
                  <dd className="text-ink-primary font-bold">{formatPKR(grossThisMonth)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Hostello share</dt>
                  <dd className="text-ink-primary font-bold">
                    −{formatPKR(Math.max(0, grossThisMonth - payoutThisMonth))}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-2 text-base">
                  <dt className="text-ink-primary font-bold">You get</dt>
                  <dd className="text-hostello-gold-bright font-extrabold">{formatPKR(payoutThisMonth)}</dd>
                </div>
              </dl>
            </InfoSheet>
          </div>
          <p className="num flex items-baseline gap-2">
            <span className="text-base font-bold text-white/85">Rs</span>
            <span className="text-[44px] md:text-5xl font-extrabold leading-none">
              <CountUp value={payoutThisMonth} />
            </span>
          </p>
          <HeroChange current={payoutThisMonth} previous={payoutLastMonth} />
          <HeroTrend series={payoutSeries} id="owner-payout" />
          <div className="grid grid-cols-2 gap-2.5 mt-2">
            <HeroStat label="Gross" value={grossThisMonth} />
            <HeroStat label="Nights" value={nightsSold} />
          </div>
        </section>

        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          <OccupancyRing pct={occupancyPct} href="/client/calendar" />
          <StatTile
            href="/client/bookings"
            icon={BedDouble}
            tint="bg-violet-500/20 text-violet-300"
            value={rows.length}
            label="Stays"
          />
          <StatTile
            href="/client/settlements"
            icon={Wallet}
            tint="bg-amber-300/15 text-hostello-gold-bright"
            value={awaiting}
            label="Awaiting"
            valueClass="text-hostello-gold-bright"
          />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Today</h2>
          <Link href="/client/today" className="text-[13px] font-bold text-hostello-purple-light">
            Day sheet
          </Link>
        </div>
        <TodayStories stays={activity} today={today} hrefBase="/client/bookings" />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Coming up</h2>
          <Link href="/client/bookings" className="text-[13px] font-bold text-hostello-purple-light">
            All
          </Link>
        </div>
        {comingUp.length === 0 ? (
          <div className="card px-4 py-6 flex flex-col items-center gap-3 text-center">
            <span className="w-12 h-12 rounded-2xl gradient-brand-subtle flex items-center justify-center text-hostello-purple-light">
              <CalendarPlus size={22} />
            </span>
            <p className="text-sm text-ink-secondary">Nothing booked in the next 30 days.</p>
            <Link href="/client/bookings/new" className="btn btn-primary">
              <Plus size={16} strokeWidth={2.5} />
              New booking
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {comingUp.map((b) => (
              <li key={b.id}>
                <StayRow
                  href={`/client/bookings/${b.id}`}
                  guestName={b.guest_name}
                  units={unitNames(b)}
                  checkIn={b.check_in}
                  checkOut={b.check_out}
                  source={b.source}
                  photo={firstUnitPhoto(b.booking_properties)}
                  // The owner's own money, and only once the stay is confirmed.
                  amount={b.status === "confirmed" ? Number(b.client_payout ?? 0) : null}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg">Payouts</h2>
          <PeriodSelect value={period.key} />
        </div>
        <div>
          <p className="num text-2xl font-extrabold">{formatPKR(periodPayout)}</p>
          <Delta current={periodPayout} previous={prevPeriodPayout} suffix={period.compareLabel} />
        </div>
        {periodPayout > 0 ? (
          <RevenueChart dates={period.days} series={periodSeries} />
        ) : (
          <p className="tile px-5 py-8 text-center text-sm text-ink-secondary">
            No payouts in {period.label}.
          </p>
        )}
      </section>
    </div>
  );
}
