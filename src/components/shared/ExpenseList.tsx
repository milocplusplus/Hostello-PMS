import Link from "next/link";
import { ChevronLeft, ChevronRight, Paperclip, Pencil } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import { addMonths, formatDayMonth, formatMonthLabel, formatMonthParam, todayISO } from "@/lib/calendar";
import { expenseMethodLabel, type Expense } from "@/lib/expenses";

/**
 * An owner's expenses for one month. Shared by the owner's page, where each row
 * links to its edit screen, and the admin's read-only view, where it does not —
 * `editHref` absent is what makes it read-only.
 */
export function ExpenseList({
  expenses,
  editHref,
  empty,
}: {
  expenses: Expense[];
  editHref?: (id: string) => string;
  empty: string;
}) {
  if (expenses.length === 0) {
    return <div className="card p-8 text-center text-sm text-ink-secondary">{empty}</div>;
  }

  const today = todayISO();

  return (
    <ul className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
      {expenses.map((e) => {
        const overdue = !e.paid && e.dueOn != null && e.dueOn < today;
        const details = [
          e.propertyName ?? "All units",
          e.vendor,
          expenseMethodLabel(e.method),
          formatDayMonth(e.incurredOn),
        ].filter(Boolean);

        return (
          <li key={e.id} className="px-4 md:px-5 py-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-primary truncate">{e.categoryName}</p>
              <p className="text-xs text-ink-secondary truncate mt-0.5">{details.join(" · ")}</p>
              {e.note && <p className="text-[11px] text-ink-muted mt-1">{e.note}</p>}
            </div>

            <div className="text-right shrink-0">
              <p className="num text-sm text-ink-primary">{formatPKR(e.amount)}</p>
              <p
                className={`text-[11px] mt-0.5 ${
                  e.paid ? "text-ink-muted" : overdue ? "text-negative" : "text-status-pending"
                }`}
              >
                {e.paid
                  ? "Paid"
                  : e.dueOn
                    ? `${overdue ? "Overdue" : "Unpaid"} · due ${formatDayMonth(e.dueOn)}`
                    : "Unpaid"}
              </p>
            </div>

            <div className="flex items-center gap-0.5 shrink-0 -mr-1.5">
              {e.receiptUrl && (
                <a
                  href={e.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-md text-ink-muted hover:text-ink-primary hover:bg-surface-2 transition-colors"
                  aria-label={e.receiptIsPdf ? "Open the bill (PDF)" : "Open the bill photo"}
                >
                  <Paperclip size={14} />
                </a>
              )}
              {editHref && (
                <Link
                  href={editHref(e.id)}
                  className="p-1.5 rounded-md text-ink-muted hover:text-ink-primary hover:bg-surface-2 transition-colors"
                  aria-label="Edit expense"
                >
                  <Pencil size={14} />
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** ‹ September 2026 › — the month on screen, carrying the other params along. */
export function ExpenseMonthNav({
  basePath,
  year,
  month0,
  params = {},
}: {
  basePath: string;
  year: number;
  month0: number;
  params?: Record<string, string | undefined>;
}) {
  const href = (delta: number) => {
    const m = addMonths(year, month0, delta);
    const q = new URLSearchParams({ month: formatMonthParam(m.year, m.month0) });
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    return `${basePath}?${q}`;
  };

  return (
    <div className="flex items-center gap-1">
      <Link
        href={href(-1)}
        className="p-1.5 rounded-md text-ink-muted hover:text-ink-primary hover:bg-surface-2 transition-colors"
        aria-label="Previous month"
      >
        <ChevronLeft size={16} />
      </Link>
      <span className="text-sm text-ink-primary min-w-[9.5rem] text-center">
        {formatMonthLabel(year, month0)}
      </span>
      <Link
        href={href(1)}
        className="p-1.5 rounded-md text-ink-muted hover:text-ink-primary hover:bg-surface-2 transition-colors"
        aria-label="Next month"
      >
        <ChevronRight size={16} />
      </Link>
    </div>
  );
}

/** Spent this month, and every bill still owed whatever month it is from. */
export function ExpenseSummary({
  monthLabel,
  monthTotal,
  count,
  filtered,
  unpaid,
}: {
  monthLabel: string;
  monthTotal: number;
  count: number;
  filtered: boolean;
  unpaid: { total: number; count: number; earliestDue: string | null };
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="tile px-4 py-3">
        <p className="text-xs text-ink-secondary">
          {filtered ? `Shown for ${monthLabel}` : `Spent in ${monthLabel}`}
        </p>
        <p className="num text-xl text-ink-primary mt-1">{formatPKR(monthTotal)}</p>
        <p className="text-[11px] text-ink-muted mt-1">
          {count === 0 ? "Nothing recorded" : count === 1 ? "1 expense" : `${count} expenses`}
          {filtered ? " matching the filters" : ""}
        </p>
      </div>
      <div className="tile px-4 py-3">
        <p className="text-xs text-ink-secondary">Still to pay</p>
        <p
          className={`num text-xl mt-1 ${unpaid.total > 0 ? "text-status-pending" : "text-ink-primary"}`}
        >
          {formatPKR(unpaid.total)}
        </p>
        <p className="text-[11px] text-ink-muted mt-1">
          {unpaid.count === 0
            ? "No unpaid bills"
            : `${unpaid.count === 1 ? "1 bill" : `${unpaid.count} bills`}, any month${
                unpaid.earliestDue ? ` · earliest due ${formatDayMonth(unpaid.earliestDue)}` : ""
              }`}
        </p>
      </div>
    </div>
  );
}
