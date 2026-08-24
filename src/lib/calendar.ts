export type CalendarCell = { date: string | null };

/**
 * Builds a 7-column month grid (Sun–Sat) for the given year/month.
 * month0 is zero-indexed (0 = January).
 * Cells outside the month are null-padded so the grid stays a clean 7-wide table.
 */
export function getMonthGrid(year: number, month0: number): CalendarCell[] {
  const firstOfMonth = new Date(Date.UTC(year, month0, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();

  const cells: CalendarCell[] = [];

  for (let i = 0; i < startWeekday; i++) {
    cells.push({ date: null });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(year, month0, d));
    cells.push({ date: date.toISOString().slice(0, 10) });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null });
  }

  return cells;
}

export function formatMonthLabel(year: number, month0: number): string {
  const d = new Date(Date.UTC(year, month0, 1));
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function parseMonthParam(monthParam: string | undefined): { year: number; month0: number } {
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    return { year: y, month0: m - 1 };
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month0: now.getUTCMonth() };
}

export function formatMonthParam(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

export function addMonths(year: number, month0: number, delta: number): { year: number; month0: number } {
  const total = year * 12 + month0 + delta;
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 };
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "14 Sep" — short label for booking rows and date badges. */
export function formatDayMonth(dateISO: string): string {
  return new Date(dateISO + "T00:00:00Z").toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "Mon" — column header letter block for the calendar grid. */
export function weekdayShort(dateISO: string): string {
  return new Date(dateISO + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

export function isWeekend(dateISO: string): boolean {
  const day = new Date(dateISO + "T00:00:00Z").getUTCDay();
  return day === 0 || day === 6;
}

/** Sunday of the week containing dateISO — matches getMonthGrid's Sun–Sat columns. */
export function startOfWeekISO(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00Z");
  return addDaysISO(dateISO, -d.getUTCDay());
}

/** `count` consecutive ISO dates starting at startISO. */
export function daysFrom(startISO: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDaysISO(startISO, i));
}

/** "14 – 20 Sep 2026" / "28 Sep – 4 Oct 2026" — week-view range label. */
export function formatRangeLabel(startISO: string, endISO: string): string {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const left = sameMonth
    ? String(start.getUTCDate())
    : start.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
  const right = end.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${left} – ${right}`;
}
