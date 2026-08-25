import { addMonths, daysBetweenISO, daysFrom } from "./calendar";

export type PeriodKey = "this_month" | "last_month" | "last_3" | "this_year";

export const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3", label: "Last 3 months" },
  { value: "this_year", label: "This year" },
];

export function parsePeriod(value: string | undefined): PeriodKey {
  return PERIODS.some((p) => p.value === value) ? (value as PeriodKey) : "this_month";
}

export type PeriodRange = {
  key: PeriodKey;
  /** "August 2026" / "Jun – Aug 2026" / "2026" */
  label: string;
  start: string;
  end: string;
  /** The equivalent window one period back, for the delta. */
  prevStart: string;
  prevEnd: string;
  /** Every date in the window — one chart point each. */
  days: string[];
  compareLabel: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const firstOf = (year: number, month0: number) => `${year}-${pad(month0 + 1)}-01`;
const lastOf = (year: number, month0: number) =>
  new Date(Date.UTC(year, month0 + 1, 0)).toISOString().slice(0, 10);

function monthLabel(year: number, month0: number, long = true) {
  return new Date(Date.UTC(year, month0, 1)).toLocaleDateString("en-US", {
    month: long ? "long" : "short",
    year: long ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

/**
 * Windows the dashboards can show revenue over. Each one compares against the
 * same span one period back — never against a made-up baseline.
 */
export function periodRange(key: PeriodKey, todayISO: string): PeriodRange {
  const year = Number(todayISO.slice(0, 4));
  const month0 = Number(todayISO.slice(5, 7)) - 1;

  let start: string;
  let end: string;
  let prevStart: string;
  let prevEnd: string;
  let label: string;
  let compareLabel: string;

  if (key === "last_month") {
    const m = addMonths(year, month0, -1);
    const p = addMonths(year, month0, -2);
    start = firstOf(m.year, m.month0);
    end = lastOf(m.year, m.month0);
    prevStart = firstOf(p.year, p.month0);
    prevEnd = lastOf(p.year, p.month0);
    label = monthLabel(m.year, m.month0);
    compareLabel = "vs the month before";
  } else if (key === "last_3") {
    const s = addMonths(year, month0, -2);
    const ps = addMonths(year, month0, -5);
    const pe = addMonths(year, month0, -3);
    start = firstOf(s.year, s.month0);
    end = lastOf(year, month0);
    prevStart = firstOf(ps.year, ps.month0);
    prevEnd = lastOf(pe.year, pe.month0);
    label = `${monthLabel(s.year, s.month0, false)} – ${monthLabel(year, month0, false)} ${year}`;
    compareLabel = "vs the 3 months before";
  } else if (key === "this_year") {
    start = `${year}-01-01`;
    end = `${year}-12-31`;
    prevStart = `${year - 1}-01-01`;
    prevEnd = `${year - 1}-12-31`;
    label = String(year);
    compareLabel = `vs ${year - 1}`;
  } else {
    const p = addMonths(year, month0, -1);
    start = firstOf(year, month0);
    end = lastOf(year, month0);
    prevStart = firstOf(p.year, p.month0);
    prevEnd = lastOf(p.year, p.month0);
    label = monthLabel(year, month0);
    compareLabel = "vs last month";
  }

  return {
    key,
    label,
    start,
    end,
    prevStart,
    prevEnd,
    days: daysFrom(start, daysBetweenISO(start, end) + 1),
    compareLabel,
  };
}
