import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import type { Breakdown, MonthProfit } from "@/lib/profit";

/**
 * The Profit tab: what an owner's stays paid them this month, less what their
 * units cost. Every figure comes from `loadProfit` — this only lays it out.
 * Months before they started recording expenses show no profit rather than a
 * flattering one.
 */

function signed(n: number) {
  return n < 0 ? `−${formatPKR(Math.abs(n))}` : formatPKR(n);
}

function profitTone(n: number) {
  return n < 0 ? "text-negative" : "text-positive";
}

/** Versus last month. Says nothing rather than invent a trend from no history. */
function Change({ now, before }: { now: number; before: number | null }) {
  if (before === null) return null;
  if (before === 0) return <span className="text-ink-muted">new this month</span>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span className="text-ink-muted">same as last month</span>;
  const up = pct > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  // Spending more is the bad direction here, so up is the warning colour.
  return (
    <span className={`inline-flex items-center gap-0.5 ${up ? "text-negative" : "text-positive"}`}>
      <Icon size={11} strokeWidth={2.5} />
      {Math.abs(pct)}% vs last month
    </span>
  );
}

function BreakdownList({ lines, total, empty }: { lines: Breakdown[]; total: number; empty: string }) {
  if (lines.length === 0) {
    return <p className="rounded-lg bg-surface-2/60 py-8 text-center text-sm text-ink-secondary">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {lines.map((l) => {
        const share = total > 0 ? Math.round((l.amount / total) * 100) : 0;
        return (
          <li key={l.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-ink-primary truncate">{l.label}</span>
                <span className="text-[11px] text-ink-muted shrink-0">{share}%</span>
              </span>
              <span className="num text-sm text-ink-primary whitespace-nowrap">{formatPKR(l.amount)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full rounded-full bg-hostello-gold" style={{ width: `${share}%` }} />
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px] text-ink-muted">
              <span>{l.count === 1 ? "1 expense" : `${l.count} expenses`}</span>
              <Change now={l.amount} before={l.previous} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ProfitBoard({ profit }: { profit: MonthProfit }) {
  const p = profit;
  const neverRecorded = p.firstExpenseMonth === null;
  const hasUnits = p.units.length > 0 || p.generalExpenses > 0;

  return (
    <div className="flex flex-col gap-6">
      {neverRecorded && (
        <p className="tile px-4 py-3 text-xs text-ink-secondary">
          Record your expenses and this page shows what each unit really earned you. Until then
          it can only show what your stays paid.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="tile px-4 py-3">
          <p className="text-xs text-ink-secondary">Your payout</p>
          <p className="num text-xl text-ink-primary mt-1">{formatPKR(p.income)}</p>
          <p className="text-[11px] text-ink-muted mt-1">
            {p.stays === 1 ? "1 confirmed stay" : `${p.stays} confirmed stays`} checking in
          </p>
        </div>
        <div className="tile px-4 py-3">
          <p className="text-xs text-ink-secondary">Expenses</p>
          <p className="num text-xl text-ink-primary mt-1">{p.recorded ? formatPKR(p.expenses) : "—"}</p>
          <p className="text-[11px] text-ink-muted mt-1">
            {p.recorded ? "Confirmed, by bill date" : "Not recorded for this month"}
          </p>
        </div>
        <div className="tile px-4 py-3">
          <p className="text-xs text-ink-secondary">Profit</p>
          <p className={`num text-xl mt-1 ${p.recorded ? profitTone(p.profit) : "text-ink-primary"}`}>
            {p.recorded ? signed(p.profit) : "—"}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            {p.recorded ? `In ${p.monthLabel}` : "Needs this month's expenses"}
          </p>
        </div>
      </div>

      <section className="card overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
          <h2 className="text-sm font-medium text-ink-primary">By unit</h2>
          <p className="text-[11px] text-ink-muted mt-0.5">
            A stay on several units is split evenly between them. Cost per night is the unit&apos;s
            expenses over the nights it sold.
          </p>
        </div>
        {!hasUnits ? (
          <p className="px-5 py-8 text-center text-sm text-ink-secondary">No units on your account yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[34rem]">
              <thead>
                <tr className="text-ink-muted text-left">
                  <th className="font-normal px-4 md:px-5 py-2">Unit</th>
                  <th className="font-normal px-3 py-2 text-right">Payout</th>
                  <th className="font-normal px-3 py-2 text-right">Expenses</th>
                  <th className="font-normal px-3 py-2 text-right">Profit</th>
                  <th className="font-normal px-3 py-2 text-right">Nights</th>
                  <th className="font-normal px-4 md:px-5 py-2 text-right">Cost / night</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-hairline)] border-t border-border-hairline">
                {p.units.map((u) => (
                  <tr key={u.propertyId}>
                    <td className="px-4 md:px-5 py-2.5 text-ink-primary">{u.name}</td>
                    <td className="num px-3 py-2.5 text-right text-ink-primary">{formatPKR(u.income)}</td>
                    <td className="num px-3 py-2.5 text-right text-ink-secondary">
                      {p.recorded ? formatPKR(u.expenses) : "—"}
                    </td>
                    <td className={`num px-3 py-2.5 text-right ${p.recorded ? profitTone(u.profit) : "text-ink-muted"}`}>
                      {p.recorded ? signed(u.profit) : "—"}
                    </td>
                    <td className="num px-3 py-2.5 text-right text-ink-secondary">{u.nights}</td>
                    <td className="num px-4 md:px-5 py-2.5 text-right text-ink-secondary">
                      {p.recorded && u.costPerNight !== null ? formatPKR(Math.round(u.costPerNight)) : "—"}
                    </td>
                  </tr>
                ))}
                {p.generalExpenses > 0 && (
                  <tr>
                    <td className="px-4 md:px-5 py-2.5 text-ink-secondary">All units / general</td>
                    <td className="px-3 py-2.5 text-right text-ink-muted">—</td>
                    <td className="num px-3 py-2.5 text-right text-ink-secondary">{formatPKR(p.generalExpenses)}</td>
                    <td className="num px-3 py-2.5 text-right text-negative">{signed(-p.generalExpenses)}</td>
                    <td className="px-3 py-2.5 text-right text-ink-muted">—</td>
                    <td className="px-4 md:px-5 py-2.5 text-right text-ink-muted">—</td>
                  </tr>
                )}
                <tr className="bg-surface-2/60">
                  <td className="px-4 md:px-5 py-2.5 text-ink-primary font-medium">Total</td>
                  <td className="num px-3 py-2.5 text-right text-ink-primary font-medium">{formatPKR(p.income)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-primary font-medium">
                    {p.recorded ? formatPKR(p.expenses) : "—"}
                  </td>
                  <td
                    className={`num px-3 py-2.5 text-right font-medium ${
                      p.recorded ? profitTone(p.profit) : "text-ink-muted"
                    }`}
                  >
                    {p.recorded ? signed(p.profit) : "—"}
                  </td>
                  <td className="px-3 py-2.5" />
                  <td className="px-4 md:px-5 py-2.5" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {p.recorded && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="card p-4 md:p-5 flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-medium text-ink-primary">By category</h2>
              <p className="text-[11px] text-ink-muted mt-0.5">{p.monthLabel}</p>
            </div>
            <BreakdownList lines={p.categories} total={p.expenses} empty={`No expenses in ${p.monthLabel}.`} />
          </section>
          <section className="card p-4 md:p-5 flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-medium text-ink-primary">By who you paid</h2>
              <p className="text-[11px] text-ink-muted mt-0.5">
                Expenses with a &ldquo;Paid to&rdquo; filled in
              </p>
            </div>
            <BreakdownList
              lines={p.vendors.slice(0, 8)}
              total={p.expenses}
              empty="None of this month's expenses name who was paid."
            />
          </section>
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
          <h2 className="text-sm font-medium text-ink-primary">Last {p.trend.length} months</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[26rem]">
            <thead>
              <tr className="text-ink-muted text-left">
                <th className="font-normal px-4 md:px-5 py-2">Month</th>
                <th className="font-normal px-3 py-2 text-right">Payout</th>
                <th className="font-normal px-3 py-2 text-right">Expenses</th>
                <th className="font-normal px-4 md:px-5 py-2 text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-hairline)] border-t border-border-hairline">
              {[...p.trend].reverse().map((m, i) => (
                <tr key={m.month} className={i === 0 ? "bg-surface-2/60" : undefined}>
                  <td className="px-4 md:px-5 py-2.5 text-ink-primary">{m.label}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-primary">{formatPKR(m.income)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-secondary">
                    {m.expenses === null ? <span className="text-ink-muted">not recorded</span> : formatPKR(m.expenses)}
                  </td>
                  <td
                    className={`num px-4 md:px-5 py-2.5 text-right ${
                      m.profit === null ? "text-ink-muted" : profitTone(m.profit)
                    }`}
                  >
                    {m.profit === null ? "—" : signed(m.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-ink-muted">
        Payout here is your share of <strong className="font-medium">confirmed</strong> stays, counted
        in full in the month the guest checks in, as on Stats. The Bookings page counts every stay
        that overlaps the month, tentative ones too, so its figure for a month can differ from
        this one. Hostello&apos;s commission is not shown.
      </p>
    </div>
  );
}
