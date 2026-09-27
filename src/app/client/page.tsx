import Link from "next/link";
import { redirect } from "next/navigation";
import { BedDouble, CalendarPlus, Home, Plus, Sun, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentProfile, currentUser } from "@/lib/auth";
import { formatPKR, isPassThroughSource } from "@/lib/payout";
import { sourceColor, sourceLabel } from "@/lib/block-sources";
import {
  getMonthGrid,
  formatMonthLabel,
  formatDayMonth,
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
import { parsePeriod, periodRange } from "@/lib/period";

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

/** Stand-in for a property photo until properties have one: a gradient picked
 *  from the unit's name, so the same unit is always the same colour. */
const UNIT_TINTS = [
  "linear-gradient(135deg, #065f46, #34d399)",
  "linear-gradient(135deg, #1e3a8a, #818cf8)",
  "linear-gradient(135deg, #9a3412, #fbbf24)",
  "linear-gradient(135deg, #831843, #f472b6)",
  "linear-gradient(135deg, #134e4a, #22d3ee)",
  "linear-gradient(135deg, #4c1d95, #c084fc)",
];

function unitTint(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return UNIT_TINTS[hash % UNIT_TINTS.length];
}

/** The hero's trend line: the month's cumulative payout, scaled into a box. */
function trendPaths(series: number[], w: number, h: number) {
  const max = Math.max(...series, 0);
  if (max === 0 || series.length < 2) return null;
  const pts = series.map((v, i) => [
    (i / (series.length - 1)) * w,
    h - 4 - (v / max) * (h - 12),
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return { line, area: `${line} L${w} ${h} L0 ${h}Z`, end: pts[pts.length - 1] };
}

const STORY = {
  arriving: {
    tag: "Arriving",
    ring: "linear-gradient(135deg, #34d399, #0ea5e9)",
    chip: "bg-emerald-400/15 text-emerald-300",
  },
  leaving: {
    tag: "Leaving",
    ring: "linear-gradient(135deg, #fb923c, #f43f5e)",
    chip: "bg-orange-400/15 text-orange-300",
  },
  staying: {
    tag: "Staying",
    ring: "linear-gradient(135deg, #a855f7, #6366f1)",
    chip: "bg-violet-400/20 text-violet-300",
  },
} as const;

export default async function ClientDashboard({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const periodKey = parsePeriod((await searchParams).period);
  const supabase = await createClient();

  const user = await currentUser();
  if (!user) redirect("/login");

  const [clientRecord, profile] = await Promise.all([currentClient(), currentProfile()]);

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
      .select("property_id, start_date, end_date, block_type")
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
  const activity = ((activityRows ?? []) as unknown as BookingRow[]).map((b) => ({
    id: b.id,
    guestName: b.guest_name,
    units: unitNames(b),
    checkIn: b.check_in,
    checkOut: b.check_out,
    source: b.source,
    payout: b.status === "confirmed" ? Number(b.client_payout ?? 0) : null,
  }));
  const comingUp = activity.filter((b) => b.checkIn > today).slice(0, 4);

  // ── Today ──────────────────────────────────────────────────────────────────
  // One circle per stay: an arrival is also staying tonight, so it shows once.
  const stories = [
    ...activity.filter((b) => b.checkIn === today).map((b) => ({ kind: "arriving" as const, b })),
    ...activity.filter((b) => b.checkOut === today).map((b) => ({ kind: "leaving" as const, b })),
    ...activity
      .filter((b) => b.checkIn < today && b.checkOut > today)
      .map((b) => ({ kind: "staying" as const, b })),
  ];

  // ── Hero ───────────────────────────────────────────────────────────────────
  const trend = trendPaths(payoutSeries, 320, 72);
  const change =
    payoutLastMonth > 0
      ? Math.round(((payoutThisMonth - payoutLastMonth) / payoutLastMonth) * 100)
      : null;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Karachi" }).format(
      new Date()
    )
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (profile?.full_name ?? clientRecord.name).trim().split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-6 stagger">
      <header className="flex items-center gap-3">
        <Avatar name={profile?.full_name ?? clientRecord.name} size={46} />
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
          {change !== null && (
            <p className="flex items-center gap-2 text-xs">
              <span className="num inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 font-extrabold">
                {change >= 0 ? <TrendingUp size={14} strokeWidth={2.5} /> : <TrendingDown size={14} strokeWidth={2.5} />}
                {change >= 0 ? "+" : "−"}
                {Math.abs(change)}%
              </span>
              <span className="text-white/80">vs last month</span>
            </p>
          )}
          {trend && (
            <svg viewBox="0 0 320 72" preserveAspectRatio="none" className="w-full h-[72px] mt-2 overflow-visible" aria-hidden>
              <defs>
                <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={trend.area} fill="url(#hero-fill)" className="animate-fade" style={{ animationDelay: "1.2s" }} />
              <path
                d={trend.line}
                pathLength={1}
                fill="none"
                stroke="#fff"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="draw-in"
              />
            </svg>
          )}
          <div className="grid grid-cols-2 gap-2.5 mt-2">
            <div className="rounded-2xl bg-black/25 px-3.5 py-2.5">
              <p className="text-[11px] font-bold text-white/75">Gross</p>
              <p className="num text-lg font-extrabold">
                <CountUp value={grossThisMonth} />
              </p>
            </div>
            <div className="rounded-2xl bg-black/25 px-3.5 py-2.5">
              <p className="text-[11px] font-bold text-white/75">Nights</p>
              <p className="num text-lg font-extrabold">
                <CountUp value={nightsSold} />
              </p>
            </div>
          </div>
        </section>

        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          <Link
            href="/client/calendar"
            className="card card-hover row-span-2 p-4 flex flex-col items-center justify-center gap-2.5"
          >
            <span className="relative w-[7.5rem] h-[7.5rem]">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden>
                <defs>
                  <linearGradient id="occ-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="var(--color-hostello-gold-bright)" />
                    <stop offset="1" stopColor="var(--color-hostello-magenta)" />
                  </linearGradient>
                </defs>
                <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="13" />
                {occupancyPct > 0 && (
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke="url(#occ-ring)"
                    strokeWidth="13"
                    strokeLinecap="round"
                    pathLength={100}
                    strokeDasharray="100"
                    strokeDashoffset={100 - occupancyPct}
                    className="ring-in"
                    style={{ filter: "drop-shadow(0 0 8px rgba(192,38,211,0.45))" }}
                  />
                )}
              </svg>
              <span className="num absolute inset-0 flex items-center justify-center text-[28px] font-extrabold">
                <CountUp value={occupancyPct} />
                <span className="text-base mt-2">%</span>
              </span>
            </span>
            <span className="text-[13px] font-bold text-ink-secondary">Occupancy</span>
          </Link>
          <Link href="/client/bookings" className="card card-hover p-4 flex flex-col gap-2.5">
            <span className="w-10 h-10 rounded-[14px] bg-violet-500/20 text-violet-300 flex items-center justify-center">
              <BedDouble size={20} />
            </span>
            <span>
              <span className="num block text-[26px] font-extrabold leading-tight">
                <CountUp value={rows.length} />
              </span>
              <span className="text-xs font-bold text-ink-muted">Stays</span>
            </span>
          </Link>
          <Link href="/client/settlements" className="card card-hover p-4 flex flex-col gap-2.5">
            <span className="w-10 h-10 rounded-[14px] bg-amber-300/15 text-hostello-gold-bright flex items-center justify-center">
              <Wallet size={20} />
            </span>
            <span className="min-w-0">
              <span className="num block text-[22px] font-extrabold leading-tight text-hostello-gold-bright truncate">
                <CountUp value={awaiting} />
              </span>
              <span className="text-xs font-bold text-ink-muted">Awaiting</span>
            </span>
          </Link>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Today</h2>
          <Link href="/client/today" className="text-[13px] font-bold text-hostello-purple-light">
            Day sheet
          </Link>
        </div>
        {stories.length === 0 ? (
          <p className="card px-4 py-4 flex items-center gap-3 text-sm text-ink-secondary">
            <Sun size={18} className="text-hostello-gold-bright shrink-0" />
            No arrivals or departures today.
          </p>
        ) : (
          <ul className="flex gap-3 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1 [scrollbar-width:none]">
            {stories.map(({ kind, b }) => (
              <li key={`${kind}-${b.id}`} className="shrink-0">
                <Link
                  href={`/client/bookings/${b.id}`}
                  className="w-[4.75rem] flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <span className="rounded-full p-[3px]" style={{ background: STORY[kind].ring }}>
                    <span className="block rounded-full border-[3px] border-surface-0">
                      <Avatar name={b.guestName} size={58} />
                    </span>
                  </span>
                  <span className="text-[13px] font-bold truncate max-w-full">
                    {b.guestName?.trim().split(/\s+/)[0] ?? "Guest"}
                  </span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${STORY[kind].chip}`}>
                    {STORY[kind].tag}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
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
                <Link href={`/client/bookings/${b.id}`} className="card card-hover p-2.5 flex items-center gap-3">
                  <span
                    className="w-[3.25rem] h-[3.25rem] rounded-[17px] flex items-center justify-center shrink-0 text-white/90"
                    style={{ background: unitTint(b.units || "unit") }}
                  >
                    <Home size={22} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-extrabold truncate">{b.guestName ?? "Guest"}</span>
                    <span className="block text-xs text-ink-secondary truncate">
                      {b.units || "—"} · {formatDayMonth(b.checkIn)} – {formatDayMonth(b.checkOut)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1.5 shrink-0">
                    {b.payout !== null && (
                      <span className="num text-sm font-extrabold text-hostello-gold-bright">
                        {formatPKR(b.payout)}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink-secondary">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sourceColor(b.source) }} />
                      {sourceLabel(b.source)?.split(" ")[0] ?? "Other"}
                    </span>
                  </span>
                </Link>
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
