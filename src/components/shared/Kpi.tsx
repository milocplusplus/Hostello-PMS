import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from "lucide-react";
import { Sparkline } from "@/components/admin/Sparkline";

/** Period-over-period delta. With no prior-month data it says so rather than inventing a trend. */
export function Delta({
  current,
  previous,
  suffix,
}: {
  current: number;
  previous: number;
  suffix?: string;
}) {
  if (previous === 0) {
    // With a custom comparison window the month wording would be wrong.
    const text = suffix
      ? current === 0
        ? "No activity to compare"
        : "Nothing recorded in the previous period"
      : current === 0
        ? "No activity last month"
        : "First month with activity";
    return <p className="text-[11px] text-ink-muted mt-1.5">{text}</p>;
  }
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="text-[11px] mt-1.5 flex items-center gap-1.5 flex-wrap">
      {/* The number itself is a pill, so the direction reads before the digits do */}
      <span
        className={`num inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium border ${
          up
            ? "text-positive border-positive/25 bg-positive/10"
            : "text-negative border-negative/25 bg-negative/10"
        }`}
      >
        <Icon size={11} strokeWidth={2.5} />
        {up ? "+" : "−"}
        {Math.abs(pct)}%
      </span>
      <span className="text-ink-muted">{suffix ?? "vs last month"}</span>
    </p>
  );
}

export function Kpi({
  label,
  value,
  icon: Icon,
  tint,
  iconInk,
  series,
  sparkId,
  href,
  children,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tint: string;
  iconInk?: string;
  series: number[];
  sparkId: string;
  href?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <>
      {/* The card's own colour comes from its metric — a wash bleeding out of
          the icon corner, brightening on hover. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-[0.12] transition-opacity duration-300 group-hover:opacity-25"
        style={{ background: `radial-gradient(18rem 7rem at 10% 0%, ${tint}, transparent 70%)` }}
      />
      {/* The icon sits beside the label, not beside the value — a figure like
          "PKR 1,284,000" needs the card's full width or it truncates. */}
      <div className="relative p-4 md:p-5 pb-2">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow pt-1">{label}</p>
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
            style={{
              backgroundColor: tint,
              boxShadow: `0 1px 0 rgba(255,255,255,0.25) inset, 0 8px 20px -8px ${tint}`,
            }}
          >
            <Icon size={19} strokeWidth={2} className={iconInk ?? "text-white"} />
          </span>
        </div>
        <p className="display num text-[26px] leading-tight font-semibold mt-2 text-ink-primary truncate">
          {value}
        </p>
        {children}
      </div>
      {/* Full-bleed to the card's bottom edge: the trend is the card's floor, not
          another boxed-in chart. */}
      <div className="relative mt-1">
        <Sparkline values={series} color={tint} id={sparkId} />
      </div>
    </>
  );
  const className =
    "group card card-hover overflow-hidden flex flex-col justify-between relative";
  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

export function OccupancyDonut({
  occupied,
  blocked,
  available,
}: {
  occupied: number;
  blocked: number;
  available: number;
}) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const segments = [
    { value: occupied, color: "var(--color-hostello-purple-glow)" },
    { value: blocked, color: "var(--color-status-blocked)" },
    { value: available, color: "var(--color-positive)" },
  ];
  // A hair of empty track between segments; without it three arcs read as one
  // continuous ring and the split is invisible.
  const gap = 2;
  let offset = 0;
  return (
    <svg viewBox="0 0 140 140" className="w-36 h-36 -rotate-90 shrink-0">
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke="var(--color-surface-2)"
        strokeWidth="14"
      />
      {segments.map((s) => {
        const full = (s.value / 100) * c;
        const len = Math.max(full - gap, 0);
        const dash = (
          <circle
            key={s.color}
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            style={{ filter: `drop-shadow(0 0 6px ${s.color}55)` }}
          />
        );
        offset += full;
        return dash;
      })}
    </svg>
  );
}
