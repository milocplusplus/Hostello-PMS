import Link from "next/link";
import { Home, Sun } from "lucide-react";
import { formatDayMonth } from "@/lib/calendar";
import { formatPKR } from "@/lib/payout";
import { sourceColor, sourceLabel } from "@/lib/block-sources";
import { unitTint } from "@/lib/unit-tint";
import { Avatar } from "@/components/shared/Avatar";
import { CountUp } from "@/components/shared/CountUp";

/** The hero's trend line: a cumulative series drawn in, with a soft fill. */
export function HeroTrend({ series, id }: { series: number[]; id: string }) {
  const w = 320;
  const h = 72;
  const max = Math.max(...series, 0);
  if (max === 0 || series.length < 2) return null;
  const pts = series.map((v, i) => [(i / (series.length - 1)) * w, h - 4 - (v / max) * (h - 12)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-[72px] mt-2 overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${line} L${w} ${h} L0 ${h}Z`}
        fill={`url(#${id})`}
        className="animate-fade"
        style={{ animationDelay: "1.2s" }}
      />
      <path
        d={line}
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
  );
}

/** Month-on-month change as a pill on the hero; nothing when there is no base. */
export function HeroChange({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return (
    <p className="flex items-center gap-2 text-xs">
      <span className="num inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 font-extrabold">
        {pct >= 0 ? "▲ +" : "▼ −"}
        {Math.abs(pct)}%
      </span>
      <span className="text-white/80">vs last month</span>
    </p>
  );
}

/** A figure inside the hero, on a darker chip. */
export function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-black/25 px-3.5 py-2.5 min-w-0">
      <p className="text-[11px] font-bold text-white/75">{label}</p>
      <p className="num text-lg font-extrabold truncate">
        <CountUp value={value} />
      </p>
    </div>
  );
}

/** Occupancy as a ring that fills in. Two rows tall in the dashboards' grid. */
export function OccupancyRing({ pct, href }: { pct: number | null; href: string }) {
  return (
    <Link href={href} className="card card-hover row-span-2 p-4 flex flex-col items-center justify-center gap-2.5">
      <span className="relative w-[7.5rem] h-[7.5rem]">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden>
          <defs>
            <linearGradient id="occ-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--color-hostello-gold-bright)" />
              <stop offset="1" stopColor="var(--color-hostello-magenta)" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="13" />
          {pct !== null && pct > 0 && (
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
              strokeDashoffset={100 - pct}
              className="ring-in"
              style={{ filter: "drop-shadow(0 0 8px rgba(192,38,211,0.45))" }}
            />
          )}
        </svg>
        <span className="num absolute inset-0 flex items-center justify-center text-[28px] font-extrabold">
          {pct === null ? (
            "—"
          ) : (
            <>
              <CountUp value={pct} />
              <span className="text-base mt-2">%</span>
            </>
          )}
        </span>
      </span>
      <span className="text-[13px] font-bold text-ink-secondary">Occupancy</span>
    </Link>
  );
}

/** A small tile beside the ring: icon, figure, label. */
export function StatTile({
  href,
  icon: Icon,
  tint,
  value,
  label,
  valueClass = "",
}: {
  href: string;
  icon: typeof Home;
  tint: string;
  value: number;
  label: string;
  valueClass?: string;
}) {
  return (
    <Link href={href} className="card card-hover p-4 flex flex-col gap-2.5 min-w-0">
      <span className={`w-10 h-10 rounded-[14px] flex items-center justify-center ${tint}`}>
        <Icon size={20} />
      </span>
      <span className="min-w-0">
        <span className={`num block text-[24px] font-extrabold leading-tight truncate ${valueClass}`}>
          <CountUp value={value} />
        </span>
        <span className="text-xs font-bold text-ink-muted">{label}</span>
      </span>
    </Link>
  );
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

type StayLike = { id: string; guestName: string | null; checkIn: string; checkOut: string };

/**
 * Today's guests as story circles, one per stay: an arrival is also staying
 * tonight, so it shows once, as arriving.
 */
export function TodayStories({
  stays,
  today,
  hrefBase,
}: {
  stays: StayLike[];
  today: string;
  hrefBase: string;
}) {
  const stories = [
    ...stays.filter((b) => b.checkIn === today).map((b) => ({ kind: "arriving" as const, b })),
    ...stays.filter((b) => b.checkOut === today).map((b) => ({ kind: "leaving" as const, b })),
    ...stays
      .filter((b) => b.checkIn < today && b.checkOut > today)
      .map((b) => ({ kind: "staying" as const, b })),
  ];

  if (stories.length === 0) {
    return (
      <p className="card px-4 py-4 flex items-center gap-3 text-sm text-ink-secondary">
        <Sun size={18} className="text-hostello-gold-bright shrink-0" />
        No arrivals or departures today.
      </p>
    );
  }
  return (
    <ul className="flex gap-3 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1 [scrollbar-width:none]">
      {stories.map(({ kind, b }) => (
        <li key={`${kind}-${b.id}`} className="shrink-0">
          <Link
            href={`${hrefBase}/${b.id}`}
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
  );
}

/** One upcoming stay: unit colour tile, guest, where and when, amount, channel. */
export function StayRow({
  href,
  guestName,
  units,
  subtitle,
  checkIn,
  checkOut,
  source,
  amount,
}: {
  href: string;
  guestName: string | null;
  units: string;
  subtitle?: string | null;
  checkIn: string;
  checkOut: string;
  source: string;
  amount: number | null;
}) {
  return (
    <Link href={href} className="card card-hover p-2.5 flex items-center gap-3">
      <span
        className="w-[3.25rem] h-[3.25rem] rounded-[17px] flex items-center justify-center shrink-0 text-white/90"
        style={{ background: unitTint(units || "unit") }}
      >
        <Home size={22} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-extrabold truncate">{guestName ?? "Guest"}</span>
        <span className="block text-xs text-ink-secondary truncate">
          {[subtitle, units || "—"].filter(Boolean).join(" · ")} · {formatDayMonth(checkIn)} –{" "}
          {formatDayMonth(checkOut)}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1.5 shrink-0">
        {amount !== null && (
          <span className="num text-sm font-extrabold text-hostello-gold-bright">{formatPKR(amount)}</span>
        )}
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink-secondary">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sourceColor(source) }} />
          {(sourceLabel(source) ?? "Other").split(/[ (]/)[0]}
        </span>
      </span>
    </Link>
  );
}
