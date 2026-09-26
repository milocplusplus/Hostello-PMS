import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Tags, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { formatMonthLabel, formatMonthParam, parseMonthParam } from "@/lib/calendar";
import {
  listExpenseCategories,
  listExpenses,
  unpaidTotal,
  type ExpenseFilters,
} from "@/lib/expenses";
import { errorBanner, fieldInput, fieldLabel } from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { ExpenseList, ExpenseMonthNav, ExpenseSummary } from "@/components/shared/ExpenseList";
import { addExpenseCategory, removeExpenseCategory } from "./actions";

export default async function ClientExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    unit?: string;
    category?: string;
    status?: string;
    error?: string;
    categories?: string;
  }>;
}) {
  const sp = await searchParams;

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const { year, month0 } = parseMonthParam(sp.month);
  const monthStr = formatMonthParam(year, month0);
  const monthLabel = formatMonthLabel(year, month0);

  const filters: ExpenseFilters = {
    unit: sp.unit || undefined,
    category: sp.category || undefined,
    status: sp.status === "paid" || sp.status === "unpaid" ? sp.status : undefined,
  };
  const filtered = !!(filters.unit || filters.category || filters.status);

  const supabase = await createClient();
  // None of these depends on another, so they cost one round trip, not four.
  const [expenses, unpaid, categories, { data: properties }] = await Promise.all([
    listExpenses(supabase, clientRecord.id, { year, month0 }, filters),
    unpaidTotal(supabase, clientRecord.id),
    listExpenseCategories(supabase, clientRecord.id),
    supabase.from("properties_v").select("id, name").order("name"),
  ]);

  const monthTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const own = categories.filter((c) => c.own);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow">YOUR BOOKS</p>
          <h1 className="text-2xl md:text-3xl font-semibold mt-1.5">Expenses</h1>
          <p className="text-sm text-ink-secondary mt-2">
            What your units cost you — bills, repairs, supplies. For your own records;
            nothing here changes what Hostello owes you or you owe Hostello.
          </p>
        </div>
        <Link href={`/client/expenses/new?month=${monthStr}`} className="btn btn-gold btn-sm shrink-0">
          <Plus size={13} strokeWidth={2.5} />
          Add expense
        </Link>
      </div>

      {sp.error && <p className={errorBanner}>{sp.error}</p>}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ExpenseMonthNav
          basePath="/client/expenses"
          year={year}
          month0={month0}
          params={{ unit: sp.unit, category: sp.category, status: sp.status }}
        />

        {/* A plain GET form: the filters live in the URL like the month does. */}
        <form className="flex items-end gap-2 flex-wrap" action="/client/expenses">
          <input type="hidden" name="month" value={monthStr} />
          <select
            name="unit"
            defaultValue={sp.unit ?? ""}
            aria-label="Unit"
            className={`${fieldInput} py-1.5 text-xs w-auto`}
          >
            <option value="">All units</option>
            <option value="general">General only</option>
            {(properties ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            name="category"
            defaultValue={sp.category ?? ""}
            aria-label="Category"
            className={`${fieldInput} py-1.5 text-xs w-auto`}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={filters.status ?? ""}
            aria-label="Paid or unpaid"
            className={`${fieldInput} py-1.5 text-xs w-auto`}
          >
            <option value="">Paid and unpaid</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <button type="submit" className="btn btn-ghost btn-sm">
            Filter
          </button>
          {filtered && (
            <Link
              href={`/client/expenses?month=${monthStr}`}
              className="text-xs text-ink-muted hover:text-ink-primary transition-colors py-1.5"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      <ExpenseSummary
        monthLabel={monthLabel}
        monthTotal={monthTotal}
        count={expenses.length}
        filtered={filtered}
        unpaid={unpaid}
      />

      <ExpenseList
        expenses={expenses}
        editHref={(id) => `/client/expenses/${id}`}
        empty={
          filtered
            ? `No expenses in ${monthLabel} match these filters.`
            : `No expenses recorded for ${monthLabel}.`
        }
      />

      <details className="card group" open={sp.categories === "open"}>
        <summary className="px-4 md:px-5 py-3 flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary cursor-pointer list-none transition-colors">
          <Tags size={14} className="text-ink-muted" />
          Categories
          <span className="text-[11px] text-ink-muted ml-auto">
            {own.length === 0 ? "Standard only" : `${own.length} of your own`}
          </span>
        </summary>

        <div className="px-4 md:px-5 pb-4 flex flex-col gap-4 border-t border-border-hairline pt-4">
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) =>
              c.own ? (
                <form
                  key={c.id}
                  action={removeExpenseCategory}
                  className="tile inline-flex items-center gap-1 pl-2.5 pr-1 py-1 text-xs text-ink-primary"
                >
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="month" value={monthStr} />
                  {c.name}
                  <ConfirmDeleteButton
                    confirmText={`Remove the "${c.name}" category?`}
                    label={`Remove ${c.name}`}
                    busy="Removing the category…"
                    className="p-0.5 rounded text-ink-muted hover:text-status-booked transition-colors"
                  >
                    <X size={12} />
                  </ConfirmDeleteButton>
                </form>
              ) : (
                <span key={c.id} className="tile px-2.5 py-1 text-xs text-ink-secondary">
                  {c.name}
                </span>
              )
            )}
          </div>

          <form action={addExpenseCategory} className="flex items-end gap-2 flex-wrap">
            <input type="hidden" name="month" value={monthStr} />
            <div className="flex flex-col gap-1.5 flex-1 min-w-[12rem]">
              <label htmlFor="category_name" className={fieldLabel}>
                Add your own
              </label>
              <input
                id="category_name"
                name="name"
                required
                maxLength={60}
                placeholder="e.g. Generator fuel"
                className={`${fieldInput} py-1.5 text-xs`}
              />
            </div>
            <SubmitButton className="btn btn-ghost btn-sm" busy="Adding the category…">
              Add
            </SubmitButton>
          </form>
          <p className="text-[11px] text-ink-muted">
            A category of your own can be removed while no expense uses it.
          </p>
        </div>
      </details>
    </div>
  );
}
