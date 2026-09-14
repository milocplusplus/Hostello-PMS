import { addDaysISO } from "./calendar";
import { nightsBetween } from "./payout";
import { rowShortStay } from "./short-stay";
import { sourceLabel, sourceColor } from "./block-sources";
import { statementTotals, type StatementRow, type StatementTotals } from "./statement";

/**
 * The owner's monthly report, shaped for drawing.
 *
 * Everything here comes off the same rows the CSV and the Bookings & Payouts
 * table are built from, over the same overlap window, so the picture and the
 * itemised list cannot tell different stories. Nothing is re-derived: a stay's
 * `sale_price` and `client_payout` were decided by `payout.ts` when it was
 * written.
 *
 * Like the CSV, there is **no `hostello_share` anywhere in here** — the client
 * portal shows an owner their own payout and never the other side of the split.
 */

export type ReportRow = StatementRow & {
  booking_properties: { property_id?: string; properties: { name: string } | null }[] | null;
};

export type SourceSlice = {
  key: string;
  label: string;
  /** A `var(--…)` string; the canvas resolves it against the live theme. */
  color: string;
  gross: number;
  payout: number;
  stays: number;
};

export type UnitLine = { name: string; nights: number; payout: number };

export type StatementReport = {
  clientName: string;
  monthLabel: string;
  totals: StatementTotals;
  occupancy: { nightsSold: number; nightsTotal: number; pct: number; units: number };
  /** Every day of the month grid, and the payout accumulated by each. */
  days: string[];
  cumulativePayout: number[];
  sources: SourceSlice[];
  units: UnitLine[];
  rows: ReportRow[];
};

function unitEntries(row: ReportRow) {
  return (row.booking_properties ?? []).filter((bp) => bp.properties?.name);
}

export function buildStatementReport(input: {
  rows: ReportRow[];
  /** Active units, so a property that sold nothing still appears at zero. */
  properties: { id: string; name: string }[];
  days: string[];
  clientName: string;
  monthLabel: string;
}): StatementReport {
  const { rows, properties, days, clientName, monthLabel } = input;
  const monthStart = days[0];
  const monthEnd = days[days.length - 1];

  const totals = statementTotals(rows);

  // ── Cumulative payout ──────────────────────────────────────────────────────
  // Each stay lands on its check-in day, clamped into the month, so the last
  // point equals the month's payout total on the tile above the chart.
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const perDay = new Array(days.length).fill(0);
  for (const r of rows) {
    const at = r.check_in > monthStart ? r.check_in : monthStart;
    perDay[dayIndex.get(at) ?? 0] += Number(r.client_payout ?? 0);
  }
  let running = 0;
  const cumulativePayout = perDay.map((v) => (running += v));

  // ── Sources ────────────────────────────────────────────────────────────────
  const bySource = new Map<string, SourceSlice>();
  for (const r of rows) {
    const key = r.source;
    const slice = bySource.get(key) ?? {
      key,
      label: sourceLabel(key) ?? key,
      color: sourceColor(key),
      gross: 0,
      payout: 0,
      stays: 0,
    };
    slice.gross += Number(r.sale_price ?? 0);
    slice.payout += Number(r.client_payout ?? 0);
    slice.stays += 1;
    bySource.set(key, slice);
  }
  const sources = [...bySource.values()].sort((a, b) => b.gross - a.gross);

  // ── Per unit ───────────────────────────────────────────────────────────────
  // A stay on two units is one payout, not two. It is split evenly across them
  // rather than counted twice, so the bars still add up to the month's total.
  const byUnit = new Map<string, UnitLine>();
  for (const p of properties) byUnit.set(p.name, { name: p.name, nights: 0, payout: 0 });

  for (const r of rows) {
    const entries = unitEntries(r);
    if (entries.length === 0) continue;
    const share = Number(r.client_payout ?? 0) / entries.length;
    const nights = rowShortStay(r) ? 0 : nightsBetween(r.check_in, r.check_out);
    for (const bp of entries) {
      const name = bp.properties!.name;
      const line = byUnit.get(name) ?? { name, nights: 0, payout: 0 };
      line.nights += nights;
      line.payout += share;
      byUnit.set(name, line);
    }
  }
  const units = [...byUnit.values()].sort((a, b) => b.payout - a.payout || a.name.localeCompare(b.name));

  // ── Occupancy ──────────────────────────────────────────────────────────────
  // Booking check_out is exclusive, and the nights are clipped to the month so
  // a stay spanning the boundary counts only the part inside it.
  const activeIds = new Set(properties.map((p) => p.id));
  const sold = new Set<string>();
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    for (const bp of unitEntries(r)) {
      const id = bp.property_id;
      if (!id || !activeIds.has(id)) continue;
      for (
        let d = r.check_in > monthStart ? r.check_in : monthStart;
        d < r.check_out && d <= monthEnd;
        d = addDaysISO(d, 1)
      ) {
        sold.add(`${id}|${d}`);
      }
    }
  }
  const nightsTotal = activeIds.size * days.length;

  return {
    clientName,
    monthLabel,
    totals,
    occupancy: {
      nightsSold: sold.size,
      nightsTotal,
      pct: nightsTotal > 0 ? Math.round((sold.size / nightsTotal) * 100) : 0,
      units: activeIds.size,
    },
    days,
    cumulativePayout,
    sources,
    units,
    rows,
  };
}
