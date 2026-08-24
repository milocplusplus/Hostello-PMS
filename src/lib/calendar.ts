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
