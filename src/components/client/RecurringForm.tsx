import { EXPENSE_METHODS, ordinal, type ExpenseCategory, type RecurringExpense } from "@/lib/expenses";
import { errorBanner, fieldInput, fieldLabel, primaryButton } from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import { saveRecurring } from "@/app/client/expenses/actions";

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * Set up or edit a monthly bill. `recurring` present is what makes it an edit.
 * The amount is what it usually comes to: each month's due bill starts there
 * and the owner confirms what it actually was.
 */
export function RecurringForm({
  recurring,
  categories,
  properties,
  error,
}: {
  recurring?: RecurringExpense;
  categories: ExpenseCategory[];
  properties: { id: string; name: string }[];
  error?: string;
}) {
  const standard = categories.filter((c) => !c.own);
  const own = categories.filter((c) => c.own);

  return (
    <form action={saveRecurring} className="card p-6 flex flex-col gap-4">
      {recurring && <input type="hidden" name="id" value={recurring.id} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r_category" className={fieldLabel}>
            Category
          </label>
          <select
            id="r_category"
            name="category_id"
            required
            defaultValue={recurring?.categoryId ?? ""}
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
          <label htmlFor="r_unit" className={fieldLabel}>
            Unit
          </label>
          <select
            id="r_unit"
            name="property_id"
            defaultValue={recurring?.propertyId ?? "general"}
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
          <label htmlFor="r_amount" className={fieldLabel}>
            Usually comes to (PKR)
          </label>
          <input
            id="r_amount"
            name="amount"
            type="number"
            inputMode="decimal"
            min={0.01}
            step="any"
            required
            defaultValue={recurring?.amount}
            placeholder="e.g. 4000"
            className={fieldInput}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r_day" className={fieldLabel}>
            Due every month on the
          </label>
          <select
            id="r_day"
            name="day_of_month"
            required
            defaultValue={recurring?.dayOfMonth ?? 1}
            className={fieldInput}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {ordinal(d)}
                {d > 28 ? " (or the month's last day)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r_vendor" className={fieldLabel}>
            Paid to (optional)
          </label>
          <input
            id="r_vendor"
            name="vendor"
            defaultValue={recurring?.vendor ?? ""}
            placeholder="e.g. PTCL, K-Electric"
            className={fieldInput}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r_method" className={fieldLabel}>
            Paid by (optional)
          </label>
          <select id="r_method" name="method" defaultValue={recurring?.method ?? ""} className={fieldInput}>
            <option value="">—</option>
            {EXPENSE_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="r_note" className={fieldLabel}>
          Note (optional)
        </label>
        <input
          id="r_note"
          name="note"
          defaultValue={recurring?.note ?? ""}
          placeholder="e.g. 20 Mbps line"
          className={fieldInput}
        />
      </div>

      {error && <p className={errorBanner}>{error}</p>}

      <SubmitButton
        className={`mt-1 ${primaryButton}`}
        busy={recurring ? "Saving the bill…" : "Setting up the bill…"}
      >
        {recurring ? "Save changes" : "Set up bill"}
      </SubmitButton>
    </form>
  );
}
