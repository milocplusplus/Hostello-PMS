import { Paperclip } from "lucide-react";
import { todayISO } from "@/lib/calendar";
import { RECEIPT_ACCEPT } from "@/lib/receipts";
import { EXPENSE_METHODS, type Expense, type ExpenseCategory } from "@/lib/expenses";
import { errorBanner, fieldInput, fieldLabel, primaryButton } from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import { saveExpense } from "@/app/client/expenses/actions";

/**
 * Add or edit one expense. A plain server-rendered form — `expense` present is
 * what makes it an edit. Unit is optional on purpose: a general cost belongs
 * to no one unit, and is not a unit left blank by mistake.
 */
export function ExpenseForm({
  expense,
  categories,
  properties,
  error,
  defaultDate,
}: {
  expense?: Expense;
  categories: ExpenseCategory[];
  properties: { id: string; name: string }[];
  error?: string;
  defaultDate?: string;
}) {
  const standard = categories.filter((c) => !c.own);
  const own = categories.filter((c) => c.own);

  return (
    <form action={saveExpense} className="card p-6 flex flex-col gap-4">
      {expense && <input type="hidden" name="id" value={expense.id} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="amount" className={fieldLabel}>
            Amount (PKR)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            min={0.01}
            step="any"
            required
            defaultValue={expense?.amount}
            placeholder="e.g. 4500"
            className={fieldInput}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="incurred_on" className={fieldLabel}>
            Bill date
          </label>
          <input
            id="incurred_on"
            name="incurred_on"
            type="date"
            required
            defaultValue={expense?.incurredOn ?? defaultDate ?? todayISO()}
            className={fieldInput}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="category_id" className={fieldLabel}>
            Category
          </label>
          <select
            id="category_id"
            name="category_id"
            required
            defaultValue={expense?.categoryId ?? ""}
            className={fieldInput}
          >
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
          <label htmlFor="property_id" className={fieldLabel}>
            Unit
          </label>
          <select
            id="property_id"
            name="property_id"
            defaultValue={expense?.propertyId ?? "general"}
            className={fieldInput}
          >
            <option value="general">All units / general</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="vendor" className={fieldLabel}>
            Paid to (optional)
          </label>
          <input
            id="vendor"
            name="vendor"
            defaultValue={expense?.vendor ?? ""}
            placeholder="e.g. K-Electric, Ali plumber"
            className={fieldInput}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="method" className={fieldLabel}>
            Paid by (optional)
          </label>
          <select id="method" name="method" defaultValue={expense?.method ?? ""} className={fieldInput}>
            <option value="">—</option>
            {EXPENSE_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <fieldset className="flex flex-col gap-1.5">
          <legend className={`${fieldLabel} mb-1.5`}>Status</legend>
          <div className="flex items-center gap-4 text-sm text-ink-primary h-full">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="paid" value="yes" defaultChecked={expense?.paid ?? true} />
              Paid
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="paid" value="no" defaultChecked={expense ? !expense.paid : false} />
              Not paid yet
            </label>
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="due_on" className={fieldLabel}>
            Due date (if not paid yet)
          </label>
          <input
            id="due_on"
            name="due_on"
            type="date"
            defaultValue={expense?.dueOn ?? ""}
            className={fieldInput}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="note" className={fieldLabel}>
          Note (optional)
        </label>
        <input
          id="note"
          name="note"
          defaultValue={expense?.note ?? ""}
          placeholder="e.g. AC gas refill, bedroom 2"
          className={fieldInput}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="receipt" className={fieldLabel}>
          {expense?.receiptPath ? "Replace the bill (optional)" : "Bill photo or PDF (optional)"}
        </label>
        <input id="receipt" name="receipt" type="file" accept={RECEIPT_ACCEPT} className={fieldInput} />
        {expense?.receiptPath && (
          <div className="flex items-center gap-4 text-xs mt-1 flex-wrap">
            {expense.receiptUrl && (
              <a
                href={expense.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-ink-secondary hover:text-ink-primary transition-colors"
              >
                <Paperclip size={12} />
                Current bill
              </a>
            )}
            <label className="flex items-center gap-2 text-ink-muted cursor-pointer">
              <input type="checkbox" name="remove_receipt" />
              Remove it
            </label>
          </div>
        )}
        <p className="text-[11px] text-ink-muted">PNG, JPG, WebP or PDF, up to 8 MB. Only you and Hostello can open it.</p>
      </div>

      {error && <p className={errorBanner}>{error}</p>}

      <SubmitButton
        className={`mt-1 ${primaryButton}`}
        busy={expense ? "Saving the expense…" : "Adding the expense…"}
      >
        {!expense ? "Add expense" : expense.confirmed ? "Save changes" : "Confirm bill"}
      </SubmitButton>
    </form>
  );
}
