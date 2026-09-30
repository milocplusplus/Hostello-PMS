"use client";

import { useState } from "react";
import { CircleCheck, Paperclip, Receipt, Tag, Wallet } from "lucide-react";
import { formatDayMonth, todayISO } from "@/lib/calendar";
import { formatPKR } from "@/lib/payout";
import { RECEIPT_ACCEPT } from "@/lib/receipts";
import { EXPENSE_METHODS, type Expense, type ExpenseCategory } from "@/lib/expenses";
import { errorBanner, fieldInput, fieldLabel, primaryButton } from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import { ChoiceChips, FormStep, StepForm, SummaryCard } from "@/components/shared/FormStep";
import { saveExpense } from "@/app/client/expenses/actions";

const PAID = [
  { value: "yes", label: "Paid", color: "var(--color-status-available)" },
  { value: "no", label: "Not paid yet", color: "var(--color-status-pending)" },
] as const;

const METHODS = [{ value: "", label: "Not said" }, ...EXPENSE_METHODS] as const;

/**
 * Add or edit one expense — `expense` present is what makes it an edit. Unit is
 * optional on purpose: a general cost belongs to no one unit, and is not a
 * unit left blank by mistake.
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

  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [date, setDate] = useState(expense?.incurredOn ?? defaultDate ?? todayISO());
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? "");
  const [unit, setUnit] = useState(expense?.propertyId ?? "general");
  const [vendor, setVendor] = useState(expense?.vendor ?? "");
  const [method, setMethod] = useState<string>(expense?.method ?? "");
  const [paid, setPaid] = useState<"yes" | "no">(expense && !expense.paid ? "no" : "yes");
  const [dueOn, setDueOn] = useState(expense?.dueOn ?? "");

  const amountN = Number(amount);
  const categoryName = categories.find((c) => c.id === categoryId)?.name;
  const done = [amountN > 0 && Boolean(date), Boolean(categoryId), true, true];

  return (
    <StepForm
      action={saveExpense}
      aside={
        <>
          <SummaryCard
            icon={Receipt}
            label={expense ? "This expense" : "New expense"}
            done={done}
            title={categoryName ?? "Pick a category"}
            sub={unit === "general" ? "All units / general" : properties.find((p) => p.id === unit)?.name}
            rows={[
              { label: "Bill date", value: date ? formatDayMonth(date) : "—", set: Boolean(date) },
              { label: "Paid to", value: vendor.trim() || "Not said", set: Boolean(vendor.trim()) },
              {
                label: "Status",
                value: paid === "yes" ? "Paid" : dueOn ? `Due ${formatDayMonth(dueOn)}` : "Not paid yet",
              },
              {
                label: "Amount",
                value: amountN > 0 ? formatPKR(amountN) : "Not set",
                set: amountN > 0,
                big: true,
              },
            ]}
          />

          {error && <p className={errorBanner}>{error}</p>}

          <SubmitButton
            className={`w-full ${primaryButton}`}
            busy={expense ? "Saving the expense…" : "Adding the expense…"}
          >
            {!expense ? "Add expense" : expense.confirmed ? "Save changes" : "Confirm bill"}
          </SubmitButton>
        </>
      }
    >
      {expense && <input type="hidden" name="id" value={expense.id} />}

      <FormStep n={1} icon={Wallet} title="How much, and when?" done={done[0]}>
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
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 4500"
              className={`${fieldInput} text-base font-semibold`}
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
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldInput}
            />
          </div>
        </div>
      </FormStep>

      <FormStep n={2} icon={Tag} title="What was it for?" done={done[1]}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="category_id" className={fieldLabel}>
            Category
          </label>
          <select
            id="category_id"
            name="category_id"
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
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

        <div className="flex flex-col gap-2">
          <p className={fieldLabel}>Unit</p>
          <ChoiceChips
            name="property_id"
            label="Unit"
            value={unit}
            onChange={setUnit}
            options={[{ value: "general", label: "All units / general" }, ...properties.map((p) => ({ value: p.id, label: p.name }))]}
          />
        </div>
      </FormStep>

      <FormStep n={3} icon={CircleCheck} title="Paid?" done={done[2]}>
        <ChoiceChips name="paid" label="Status" value={paid} onChange={setPaid} options={PAID} />

        {paid === "no" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="due_on" className={fieldLabel}>
              Due date (optional)
            </label>
            <input
              id="due_on"
              name="due_on"
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
              className={fieldInput}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="vendor" className={fieldLabel}>
            Paid to (optional)
          </label>
          <input
            id="vendor"
            name="vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="e.g. K-Electric, Ali plumber"
            className={fieldInput}
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className={fieldLabel}>Paid by (optional)</p>
          <ChoiceChips name="method" label="Paid by" value={method} onChange={setMethod} options={METHODS} />
        </div>
      </FormStep>

      <FormStep n={4} icon={Paperclip} title="Bill & note" done={done[3]}>
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
          <input
            id="receipt"
            name="receipt"
            type="file"
            accept={RECEIPT_ACCEPT}
            className={`${fieldInput} file:mr-3 file:rounded-full file:border-0 file:bg-hostello-purple-glow/20 file:px-3 file:py-1 file:text-xs file:text-hostello-purple-light`}
          />
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
      </FormStep>
    </StepForm>
  );
}
