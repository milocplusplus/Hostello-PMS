"use client";

import { useMemo, useState } from "react";
import { ADJUST_MODES, RATE_FIELDS, adjusted, type AdjustMode, type RateField } from "@/lib/bulk-rates";
import { fieldInput, fieldLabel, primaryButton } from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import { ChoiceChips } from "@/components/shared/FormStep";

export type RateRow = {
  id: string;
  name: string;
  stack_rate: number | null;
  short_stay_stack_rate: number | null;
  max_guests: number | null;
};

const money = (n: number | null) => (n === null ? "—" : `Rs ${n.toLocaleString("en-PK")}`);

/**
 * One client's units with the change previewed per row before anything is
 * saved. The server recomputes every value with the same `adjusted()`.
 */
export function BulkRatesTable({
  clientId,
  rows,
  action,
}: {
  clientId: string;
  rows: RateRow[];
  action: (formData: FormData) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [field, setField] = useState<RateField>("stack_rate");
  const [mode, setMode] = useState<AdjustMode>("set");
  const [value, setValue] = useState("");

  const isMoney = field !== "max_guests";
  const show = (n: number | null) => (isMoney ? money(n) : n === null ? "—" : String(n));
  const amount = Number(value);

  const preview = useMemo(
    () =>
      new Map(
        rows.map((r) => [r.id, value === "" ? undefined : adjusted(field, r[field], mode, amount)])
      ),
    [rows, field, mode, value, amount]
  );

  const allOn = rows.length > 0 && rows.every((r) => picked.has(r.id));

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="client_id" value={clientId} />

      <div className="card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className={fieldLabel}>What</p>
          <ChoiceChips
            name="field"
            label="What"
            value={field}
            onChange={setField}
            options={RATE_FIELDS.map((f) => ({ value: f.key, label: f.label }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <p className={fieldLabel}>How</p>
          <ChoiceChips
            name="mode"
            label="How"
            value={mode}
            onChange={setMode}
            options={ADJUST_MODES.map((m) => ({ value: m.key, label: m.label }))}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <label htmlFor="value" className={fieldLabel}>
            {mode.startsWith("pct") ? "Percent" : isMoney ? "Amount (PKR)" : "Guests"}
          </label>
          <input id="value" name="value" type="number" min="0" step="1" required value={value} onChange={(e) => setValue(e.target.value)} className={`${fieldInput} text-base font-semibold`} />
        </div>
        {mode.startsWith("pct") && isMoney && (
          <p className="text-[11px] text-ink-muted">Rounded to the nearest Rs 100.</p>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted border-b border-border-hairline">
              <th className="p-3 w-8">
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  aria-label="Tick every unit"
                  className="h-4 w-4 accent-[var(--color-hostello-purple)]"
                />
              </th>
              <th className="p-3">Unit</th>
              <th className="p-3">Now</th>
              <th className="p-3">After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = picked.has(r.id);
              const next = preview.get(r.id);
              return (
                <tr key={r.id} className={`border-b border-border-hairline last:border-0 ${on ? "bg-hostello-gold/5" : ""}`}>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      name="ids"
                      value={r.id}
                      checked={on}
                      onChange={(e) =>
                        setPicked((prev) => {
                          const s = new Set(prev);
                          if (e.target.checked) s.add(r.id);
                          else s.delete(r.id);
                          return s;
                        })
                      }
                      className="h-4 w-4 accent-[var(--color-hostello-purple)]"
                    />
                  </td>
                  <td className="p-3 font-bold">{r.name}</td>
                  <td className="p-3 text-ink-secondary tabular-nums">{show(r[field])}</td>
                  <td className="p-3 tabular-nums">
                    {!on || next === undefined ? (
                      <span className="text-ink-muted">—</span>
                    ) : next === null ? (
                      <span className="text-status-booked text-xs">Can&apos;t — skipped</span>
                    ) : (
                      <span className={next !== r[field] ? "text-hostello-gold font-bold" : "text-ink-secondary"}>{show(next)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SubmitButton className={primaryButton} disabled={picked.size === 0 || value === ""} busy="Updating the units…">
        Apply to {picked.size} unit{picked.size === 1 ? "" : "s"}
      </SubmitButton>
    </form>
  );
}
