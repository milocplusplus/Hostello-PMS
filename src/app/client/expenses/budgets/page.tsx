import { redirect } from "next/navigation";
import { Check, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import { formatMonthLabel, formatMonthParam, parseMonthParam } from "@/lib/calendar";
import { listBudgets, listExpenseCategories } from "@/lib/expenses";
import { errorBanner, fieldInput, fieldLabel, primaryButton } from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { ExpenseMonthNav } from "@/components/shared/ExpenseList";
import { deleteBudget, saveBudget } from "../actions";
import { PageHeader } from "@/components/shared/PageHeader";

export default async function ExpenseBudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; error?: string }>;
}) {
  const sp = await searchParams;

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const { year, month0 } = parseMonthParam(sp.month);
  const monthStr = formatMonthParam(year, month0);
  const monthLabel = formatMonthLabel(year, month0);

  const supabase = await createClient();
  const [budgets, categories, { data: properties }] = await Promise.all([
    listBudgets(supabase, clientRecord.id, { year, month0 }),
    listExpenseCategories(supabase, clientRecord.id),
    supabase.from("properties_v").select("id, name").eq("client_id", clientRecord.id).order("name"),
  ]);

  const standard = categories.filter((c) => !c.own);
  const own = categories.filter((c) => c.own);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Budgets"
        back={{ href: `/client/expenses?month=${monthStr}`, label: "Expenses" }}
        info={
          <p>
            A monthly limit on a category, for all your units or for one. You get a notification
            the morning after a month goes over it.
          </p>
        }
      />

      {sp.error && <p className={errorBanner}>{sp.error}</p>}

      <ExpenseMonthNav basePath="/client/expenses/budgets" year={year} month0={month0} />

      {budgets.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-secondary">
          No budgets yet. Utilities and repairs are the usual ones to watch.
        </div>
      ) : (
        <ul className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
          {budgets.map((b) => {
            const over = b.spent > b.amount;
            const share = Math.min(b.spent / b.amount, 1) * 100;
            return (
              <li key={b.id} className="px-4 md:px-5 py-3 flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-primary truncate">{b.categoryName}</p>
                    <p className="text-xs text-ink-secondary truncate mt-0.5">
                      {b.propertyName ?? "All units"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="num text-sm text-ink-primary">
                      {formatPKR(b.spent)}
                      <span className="text-[11px] text-ink-muted"> of {formatPKR(b.amount)}</span>
                    </p>
                    <p className={`text-[11px] mt-0.5 ${over ? "text-negative" : "text-ink-muted"}`}>
                      {over
                        ? `${formatPKR(b.spent - b.amount)} over`
                        : `${formatPKR(b.amount - b.spent)} left`}
                    </p>
                  </div>
                </div>

                <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${over ? "bg-negative" : "bg-hostello-gold"}`}
                    style={{ width: `${share}%` }}
                  />
                </div>

                <div className="flex items-center gap-2 justify-end">
                  <form action={saveBudget} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="month" value={monthStr} />
                    <input type="hidden" name="category_id" value={b.categoryId} />
                    <label htmlFor={`limit_${b.id}`} className="text-[11px] text-ink-muted">
                      Limit
                    </label>
                    <input
                      id={`limit_${b.id}`}
                      name="amount"
                      type="number"
                      inputMode="decimal"
                      min={0.01}
                      step="any"
                      required
                      defaultValue={b.amount}
                      className={`${fieldInput} py-1 text-xs w-28`}
                    />
                    <SubmitButton
                      className="p-1.5 rounded-md text-ink-muted hover:text-ink-primary hover:bg-surface-2 transition-colors"
                      ariaLabel="Save limit"
                      title="Save limit"
                      busy="Saving the limit…"
                    >
                      <Check size={14} />
                    </SubmitButton>
                  </form>
                  <form action={deleteBudget}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="month" value={monthStr} />
                    <ConfirmDeleteButton
                      confirmText="Remove this budget? Your expenses stay as they are."
                      label="Remove budget"
                      busy="Removing the budget…"
                      className="p-1.5 rounded-md text-ink-muted hover:text-status-booked hover:bg-status-booked/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </ConfirmDeleteButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {budgets.length > 0 && (
        <p className="text-[11px] text-ink-muted -mt-3">
          Spent is {monthLabel}&apos;s confirmed expenses by bill date. Bills still waiting to be
          confirmed count toward nothing.
        </p>
      )}

      <details className="group" open={budgets.length === 0 || !!sp.error}>
        <summary className="flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary cursor-pointer list-none transition-colors">
          <Plus size={14} className="text-ink-muted" />
          Set a budget
        </summary>
        <form action={saveBudget} className="card p-6 flex flex-col gap-4 mt-3">
          <input type="hidden" name="month" value={monthStr} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="b_category" className={fieldLabel}>
                Category
              </label>
              <select id="b_category" name="category_id" required defaultValue="" className={fieldInput}>
                <option value="" disabled>
                  Choose…
                </option>
                {standard.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                {own.length > 0 && (
                  <optgroup label="Your categories">
                    {own.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="b_unit" className={fieldLabel}>
                Unit
              </label>
              <select id="b_unit" name="property_id" defaultValue="general" className={fieldInput}>
                <option value="general">All units</option>
                {(properties ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="b_amount" className={fieldLabel}>
                Monthly limit (PKR)
              </label>
              <input
                id="b_amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min={0.01}
                step="any"
                required
                placeholder="e.g. 15000"
                className={fieldInput}
              />
            </div>
          </div>
          <p className="text-[11px] text-ink-muted">
            &ldquo;All units&rdquo; counts the whole category — every unit and your general bills.
            A category with no budget still tells you when a month runs well above its usual,
            once it has three months of records.
          </p>
          <SubmitButton className={primaryButton} busy="Setting the budget…">
            Set budget
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
