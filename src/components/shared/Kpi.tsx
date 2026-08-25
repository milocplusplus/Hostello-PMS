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
    return <p className="text-[11px] text-ink-muted mt-1">{text}</p>;
  }
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={`text-[11px] mt-1 flex items-center gap-0.5 ${up ? "text-positive" : "text-negative"}`}>
      <Icon size={12} />
      {up ? "+" : "−"}
      {Math.abs(pct)}% {suffix ?? "vs last month"}
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
      <div className="flex gap-3.5 p-4 md:p-5 pb-2">
        <span
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: tint }}
        >
          <Icon size={20} strokeWidth={2} className={iconInk ?? "text-white"} />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-ink-secondary">{label}</p>
          <p className="text-2xl font-semibold mt-0.5 text-ink-primary truncate">{value}</p>
          {children}
        </div>
      </div>
      <div className="px-4 md:px-5 pb-4">
        <Sparkline values={series} color={tint} id={sparkId} />
      </div>
    </>
  );
  const className = "card card-hover overflow-hidden flex flex-col justify-between";
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
  let offset = 0;
  return (
    <svg viewBox="0 0 140 140" className="w-36 h-36 -rotate-90 shrink-0">
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth="16" />
      {segments.map((s) => {
        const len = (s.value / 100) * c;
        const dash = (
          <circle
            key={s.color}
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="16"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
          />
        );
        offset += len;
        return dash;
      })}
    </svg>
  );
}
