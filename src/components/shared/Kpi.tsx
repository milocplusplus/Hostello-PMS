import { ArrowUpRight, ArrowDownRight } from "lucide-react";

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
