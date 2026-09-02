"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPKR } from "@/lib/payout";
import { PAYOUT_METHODS, methodNeedsReceipt, type PayoutMethod } from "@/lib/owed";
import { RECEIPT_ACCEPT } from "@/lib/receipts";
import { SubmitButton } from "@/components/shared/Busy";
import {
  errorBanner,
  fieldInput,
  fieldLabel,
  primaryButton,
} from "@/lib/form-styles";

/**
 * The owner's side of a payment. Client-side only because the screenshot field
 * has to appear and disappear with the method — an online transfer must carry
 * proof, cash has none to give.
 */
export function RecordPayoutForm({
  action,
  claimable,
  editing,
  error,
}: {
  action: (formData: FormData) => void;
  claimable: number;
  editing?: {
    id: string;
    amount: number;
    method: PayoutMethod;
    reference: string | null;
    hasReceipt: boolean;
  } | null;
  error?: string;
}) {
  const [method, setMethod] = useState<PayoutMethod>(editing?.method ?? "online");
  const needsReceipt = methodNeedsReceipt(method);

  return (
    <form action={action} className="card p-5 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium text-ink-primary">
          {editing ? "Correct this payment" : "Record a payment to Hostello"}
        </h2>
        <p className="text-[11px] text-ink-muted mt-1">
          {claimable > 0
            ? `Up to ${formatPKR(claimable)}. Part payments are fine — they clear your oldest bookings first.`
            : "Nothing to record: every booking is settled or already covered by an entry awaiting confirmation."}
        </p>
      </div>

      {editing && <input type="hidden" name="payout_id" value={editing.id} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="amount" className={fieldLabel}>
            Amount paid (PKR)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="1"
            step="1"
            required
            defaultValue={editing?.amount ?? undefined}
            placeholder={claimable > 0 ? String(Math.round(claimable)) : "0"}
            className={fieldInput}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>How you paid</span>
          <div className="flex gap-2">
            {PAYOUT_METHODS.map((m) => (
              <label
                key={m.value}
                className={`flex-1 text-xs rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                  method === m.value
                    ? "border-hostello-gold text-ink-primary bg-surface-2"
                    : "border-border-hairline text-ink-secondary hover:border-border-strong"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value={m.value}
                  checked={method === m.value}
                  onChange={() => setMethod(m.value)}
                  className="sr-only"
                />
                {m.short}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reference" className={fieldLabel}>
          Reference or note (optional)
        </label>
        <input
          id="reference"
          name="reference"
          type="text"
          maxLength={120}
          defaultValue={editing?.reference ?? ""}
          placeholder="Transaction ID, bank, who it was handed to…"
          className={fieldInput}
        />
      </div>

      {needsReceipt && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="receipt" className={fieldLabel}>
            Payment screenshot (PNG, JPG or PDF, up to 8 MB)
          </label>
          <input
            id="receipt"
            name="receipt"
            type="file"
            required={!editing?.hasReceipt}
            accept={RECEIPT_ACCEPT}
            className={`${fieldInput} file:mr-3 file:rounded file:border-0 file:bg-surface-3 file:px-2 file:py-1 file:text-xs file:text-ink-secondary`}
          />
          <p className="text-[11px] text-ink-muted">
            {editing?.hasReceipt
              ? "Leave this empty to keep the screenshot already attached."
              : "Required for an online transfer — it is what Hostello checks against the bank."}
          </p>
        </div>
      )}

      {error && <p className={errorBanner}>{error}</p>}

      <div className="flex items-center gap-3">
        <SubmitButton
          disabled={claimable <= 0 && !editing}
          className={primaryButton}
          blocking
          busy={needsReceipt ? "Uploading the screenshot…" : "Recording the payment…"}
          note={
            needsReceipt
              ? "The screenshot goes up with the payment. Both are saved together or not at all."
              : "Sending this to Hostello for confirmation."
          }
        >
          {editing ? "Resubmit for confirmation" : "Record payment"}
        </SubmitButton>
        {editing && (
          <Link href="/client/payouts" className="text-xs text-ink-secondary hover:text-ink-primary">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
