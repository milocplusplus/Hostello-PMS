"use client";

import { useState } from "react";
import { CalendarClock, Repeat, Tag, UserRound } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import { EXPENSE_METHODS, ordinal, type ExpenseCategory, type RecurringExpense } from "@/lib/expenses";
import { errorBanner, fieldInput, fieldLabel, primaryButton } from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import { ChoiceChips, FormStep, StepForm, SummaryCard } from "@/components/shared/FormStep";
import { saveRecurring } from "@/app/client/expenses/actions";

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const METHODS = [{ value: "", label: "Not said" }, ...EXPENSE_METHODS] as const;

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

  const [categoryId, setCategoryId] = useState(recurring?.categoryId ?? "");
  const [unit, setUnit] = useState(recurring?.propertyId ?? "general");
  const [amount, setAmount] = useState(recurring ? String(recurring.amount) : "");
  const [day, setDay] = useState(String(recurring?.dayOfMonth ?? 1));
  const [vendor, setVendor] = useState(recurring?.vendor ?? "");
  const [method, setMethod] = useState<string>(recurring?.method ?? "");

  const amountN = Number(amount);
  const done = [Boolean(categoryId), amountN > 0, Boolean(vendor.trim())];

  return (
    <StepForm
      action={saveRecurring}
      aside={
        <>
          <SummaryCard
            icon={Repeat}
            label={recurring ? "This monthly bill" : "New monthly bill"}
            done={done}
            title={categories.find((c) => c.id === categoryId)?.name ?? "Pick a category"}
            sub={unit === "general" ? "All units / general" : properties.find((p) => p.id === unit)?.name}
            rows={[
              { label: "Due", value: `Every month on the ${ordinal(Number(day))}` },
              { label: "Paid to", value: vendor.trim() || "Not said", set: Boolean(vendor.trim()) },
              {
                label: "Paid by",
                value: EXPENSE_METHODS.find((m) => m.value === method)?.label ?? "Not said",
                set: Boolean(method),
              },
              {
                label: "Usually",
                value: amountN > 0 ? formatPKR(amountN) : "Not set",
                set: amountN > 0,
                big: true,
              },
            ]}
          />

          {error && <p className={errorBanner}>{error}</p>}

          <SubmitButton
            className={`w-full ${primaryButton}`}
            busy={recurring ? "Saving the bill…" : "Setting up the bill…"}
          >
            {recurring ? "Save changes" : "Set up bill"}
          </SubmitButton>
        </>
      }
    >
      {recurring && <input type="hidden" name="id" value={recurring.id} />}

      <FormStep n={1} icon={Tag} title="Which bill?" done={done[0]}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r_category" className={fieldLabel}>
            Category
          </label>
          <select
            id="r_category"
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

      <FormStep n={2} icon={CalendarClock} title="How much, and when?" done={done[1]}>
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
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 4000"
              className={`${fieldInput} text-base font-semibold`}
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
              value={day}
              onChange={(e) => setDay(e.target.value)}
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
      </FormStep>

      <FormStep n={3} icon={UserRound} title="Who gets paid?" done={done[2]}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r_vendor" className={fieldLabel}>
            Paid to (optional)
          </label>
          <input
            id="r_vendor"
            name="vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="e.g. PTCL, K-Electric"
            className={fieldInput}
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className={fieldLabel}>Paid by (optional)</p>
          <ChoiceChips name="method" label="Paid by" value={method} onChange={setMethod} options={METHODS} />
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
      </FormStep>
    </StepForm>
  );
}
