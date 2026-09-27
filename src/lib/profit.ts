import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, formatMonthLabel, formatMonthParam } from "./calendar";
import { monthBounds } from "./expenses";
import { unitShares, type ReportRow } from "./statement-report";

/**
 * An owner's profit: what their stays paid them, less what their units cost.
 * The one place the two meet — see docs/expenses.md, phase 3.
 *
 * - **Income** is `client_payout` off `bookings_v`, as `payout.ts` decided it
 *   when the stay was written. Nothing here re-derives a split. Confirmed stays
 *   only (a tentative stay is not money made), and a stay counts whole in the
 *   month it **checks in** — not spread over the nights, and not the overlap
 *   window the statement's first page uses. Stats, the dashboards and the
 *   Bookings page's gross use this same rule.
 * - **Expenses** are confirmed expenses by bill date. A due bill is in nothing.
 * - Per unit, a stay on several units is split by `unitShares`, the statement's
 *   own rule, so the units add up to the total.
 * - A month before the owner's first recorded expense has **no** expense figure
 *   and no profit, rather than a profit of everything: they had costs, they
 *   just were not writing them down here.
 */

export type UnitProfit = {
  propertyId: string;
  name: string;
  income: number;
  expenses: number;
  profit: number;
  nights: number;
  /** Null when the unit sold no nights — there is nothing to divide by. */
  costPerNight: number | null;
};

export type Breakdown = {
  label: string;
  amount: number;
  count: number;
  /** Last month's figure, or null when last month predates their records. */
  previous: number | null;
};

export type TrendMonth = {
  month: string;
  label: string;
  income: number;
  /** Null before the first recorded expense. */
  expenses: number | null;
  profit: number | null;
};

/** One of the month's confirmed expenses, for the statement's itemised list. */
export type ProfitItem = {
  date: string;
  category: string;
  /** Null is all units / general. */
  unit: string | null;
  vendor: string | null;
  paid: boolean;
  amount: number;
};

export type MonthProfit = {
  monthLabel: string;
  income: number;
  stays: number;
  /** False for a month before the first recorded expense, or with none ever. */
  recorded: boolean;
  expenses: number;
  /** Expenses on no one unit — in the total, in no unit's profit. */
  generalExpenses: number;
  profit: number;
  units: UnitProfit[];
  categories: Breakdown[];
  vendors: Breakdown[];
  trend: TrendMonth[];
  /** This month's confirmed expenses, oldest bill first. */
  items: ProfitItem[];
  /** "YYYY-MM" of their first recorded expense, or null if none yet. */
  firstExpenseMonth: string | null;
};

type IncomeRow = Pick<
  ReportRow,
  "check_in" | "check_out" | "is_short_stay" | "short_stay_start" | "short_stay_end" | "client_payout" | "booking_properties"
>;

type ExpenseRow = {
  amount: number | string;
  incurred_on: string;
  property_id: string | null;
  vendor: string | null;
  paid: boolean;
  expense_categories: { name: string } | null;
};

function breakdown(
  now: ExpenseRow[],
  before: ExpenseRow[] | null,
  keyOf: (e: ExpenseRow) => string | null,
  labelOf: (e: ExpenseRow) => string
): Breakdown[] {
  const lines = new Map<string, Breakdown>();
  for (const e of now) {
    const key = keyOf(e);
    if (!key) continue;
    const line = lines.get(key) ?? { label: labelOf(e), amount: 0, count: 0, previous: before ? 0 : null };
    line.amount += Number(e.amount);
    line.count += 1;
    lines.set(key, line);
  }
  if (before) {
    for (const e of before) {
      const line = lines.get(keyOf(e) ?? "");
      if (line) line.previous = (line.previous ?? 0) + Number(e.amount);
    }
  }
  return [...lines.values()].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

export async function loadProfit(
  supabase: SupabaseClient,
  clientId: string,
  month: { year: number; month0: number },
  trendMonths = 6
): Promise<MonthProfit> {
  const first = addMonths(month.year, month.month0, -(trendMonths - 1));
  const rangeStart = monthBounds(first.year, first.month0).start;
  const { start: monthStart, end: monthEnd } = monthBounds(month.year, month.month0);
  const thisMonth = formatMonthParam(month.year, month.month0);

  // Independent reads, one round trip.
  const [{ data: stays }, { data: spent }, { data: earliest }, { data: properties }] = await Promise.all([
    supabase
      .from("bookings_v")
      .select(
        "check_in, check_out, is_short_stay, short_stay_start, short_stay_end, client_payout, booking_properties(property_id, properties(name))"
      )
      .eq("client_id", clientId)
      .eq("status", "confirmed")
      .gte("check_in", rangeStart)
      .lte("check_in", monthEnd),
    supabase
      .from("expenses")
      .select("amount, incurred_on, property_id, vendor, paid, expense_categories(name)")
      .eq("client_id", clientId)
      .eq("confirmed", true)
      .gte("incurred_on", rangeStart)
      .lte("incurred_on", monthEnd),
    supabase
      .from("expenses")
      .select("incurred_on")
      .eq("client_id", clientId)
      .eq("confirmed", true)
      .order("incurred_on", { ascending: true })
      .limit(1),
    supabase.from("properties_v").select("id, name, status").eq("client_id", clientId).order("name"),
  ]);

  const incomeRows = (stays ?? []) as unknown as IncomeRow[];
  const expenseRows = (spent ?? []) as unknown as ExpenseRow[];
  const firstExpenseMonth = earliest?.[0]?.incurred_on?.slice(0, 7) ?? null;
  const recordedIn = (m: string) => firstExpenseMonth !== null && m >= firstExpenseMonth;

  // ── Trend ──────────────────────────────────────────────────────────────────
  const trend: TrendMonth[] = [];
  for (let i = 0; i < trendMonths; i++) {
    const m = addMonths(first.year, first.month0, i);
    const key = formatMonthParam(m.year, m.month0);
    const income = incomeRows
      .filter((r) => r.check_in.startsWith(key))
      .reduce((sum, r) => sum + Number(r.client_payout ?? 0), 0);
    const expenses = recordedIn(key)
      ? expenseRows.filter((e) => e.incurred_on.startsWith(key)).reduce((sum, e) => sum + Number(e.amount), 0)
      : null;
    trend.push({
      month: key,
      label: formatMonthLabel(m.year, m.month0),
      income,
      expenses,
      profit: expenses === null ? null : income - expenses,
    });
  }

  // ── This month ─────────────────────────────────────────────────────────────
  const monthStays = incomeRows.filter((r) => r.check_in >= monthStart);
  const monthSpent = expenseRows.filter((e) => e.incurred_on >= monthStart);
  const prev = addMonths(month.year, month.month0, -1);
  const prevKey = formatMonthParam(prev.year, prev.month0);
  const prevSpent = trendMonths > 1 && recordedIn(prevKey)
    ? expenseRows.filter((e) => e.incurred_on.startsWith(prevKey))
    : null;

  const units = new Map<string, UnitProfit>();
  const unit = (id: string, name: string) => {
    const line = units.get(id) ?? {
      propertyId: id,
      name,
      income: 0,
      expenses: 0,
      profit: 0,
      nights: 0,
      costPerNight: null,
    };
    units.set(id, line);
    return line;
  };
  // Active units always get a row, so one that earned nothing still shows.
  for (const p of properties ?? []) if (p.status === "active") unit(p.id, p.name);

  for (const r of monthStays) {
    for (const share of unitShares(r)) {
      if (!share.propertyId) continue;
      const line = unit(share.propertyId, share.name);
      line.income += share.payout;
      line.nights += share.nights;
    }
  }

  let generalExpenses = 0;
  for (const e of monthSpent) {
    if (!e.property_id) {
      generalExpenses += Number(e.amount);
      continue;
    }
    const name = (properties ?? []).find((p) => p.id === e.property_id)?.name ?? "Unit";
    unit(e.property_id, name).expenses += Number(e.amount);
  }

  for (const line of units.values()) {
    line.profit = line.income - line.expenses;
    line.costPerNight = line.nights > 0 ? line.expenses / line.nights : null;
  }

  const income = monthStays.reduce((sum, r) => sum + Number(r.client_payout ?? 0), 0);
  const expenses = monthSpent.reduce((sum, e) => sum + Number(e.amount), 0);

  return {
    monthLabel: formatMonthLabel(month.year, month.month0),
    income,
    stays: monthStays.length,
    recorded: recordedIn(thisMonth),
    expenses,
    generalExpenses,
    profit: income - expenses,
    units: [...units.values()].sort((a, b) => b.income - a.income || a.name.localeCompare(b.name)),
    categories: breakdown(
      monthSpent,
      prevSpent,
      (e) => e.expense_categories?.name ?? "Uncategorised",
      (e) => e.expense_categories?.name ?? "Uncategorised"
    ),
    // Grouped case-insensitively, so "PTCL" and "ptcl" are one vendor. An
    // expense with no vendor named is in the categories, not here.
    vendors: breakdown(
      monthSpent,
      prevSpent,
      (e) => e.vendor?.trim().toLowerCase() || null,
      (e) => e.vendor!.trim()
    ),
    trend,
    items: [...monthSpent]
      .sort((a, b) => a.incurred_on.localeCompare(b.incurred_on))
      .map((e) => ({
        date: e.incurred_on,
        category: e.expense_categories?.name ?? "Uncategorised",
        unit: e.property_id
          ? ((properties ?? []).find((p) => p.id === e.property_id)?.name ?? "Unit")
          : null,
        vendor: e.vendor,
        paid: e.paid,
        amount: Number(e.amount),
      })),
    firstExpenseMonth,
  };
}
