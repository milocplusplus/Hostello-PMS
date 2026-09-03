"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Paperclip, ShieldCheck } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import { formatDayMonth } from "@/lib/calendar";
import {
  PAYOUT_METHODS,
  methodNeedsReceipt,
  previewAllocation,
  type OwedBooking,
  type PayoutMethod,
  type SettlementDirection,
} from "@/lib/owed";
import { RECEIPT_ACCEPT } from "@/lib/receipts";
import { Avatar } from "@/components/shared/Avatar";
import { AmountKeypad } from "@/components/shared/AmountKeypad";
import { SubmitButton } from "@/components/shared/Busy";
import { errorBanner, fieldInput, fieldLabel } from "@/lib/form-styles";

/**
 * One side sending the other money, one decision per screen.
 *
 * The stages are held here rather than in the URL for one reason: the payment
 * screenshot is a `File`, and a File cannot survive a server round-trip. So the
 * whole flow is a single `<form>` whose inactive stages are hidden rather than
 * unmounted — every input keeps its value, and the file stays attached to the
 * input that holds it until the one submit at the end.
 *
 * The same component serves both directions; only the words change, and they
 * stay together in `COPY` rather than spreading across props at the call sites.
 * Whichever side files an entry it lands as `pending` and settles nothing —
 * every screen here says so, because a flow that feels like a bank transfer is
 * exactly the flow most likely to be misread as money having moved.
 */
type Stage = "amount" | "details" | "review";

const COPY: Record<
  SettlementDirection,
  {
    recipientLabel: string;
    balanceLabel: string;
    remaining: (amount: string) => string;
    receiptHint: string;
    reviewNote: string;
    submit: string;
    editSubmit: string;
    busy: string;
    busyNote: string;
    empty: string;
    clears: string;
  }
> = {
  to_hostello: {
    recipientLabel: "Paying",
    balanceLabel: "You owe",
    remaining: (amount) => `${amount} still owed after this`,
    receiptHint: "Hostello checks this against the bank before confirming.",
    reviewNote:
      "Recording this does not clear anything on its own. Hostello confirms it once the money shows up, and your oldest bookings close first.",
    submit: "Record payment",
    editSubmit: "Resubmit for confirmation",
    busy: "Recording the payment…",
    busyNote: "Sending this to Hostello for confirmation.",
    empty: "Nothing to record — every booking is settled or already covered by an entry awaiting confirmation.",
    clears: "This payment would clear",
  },
  to_client: {
    recipientLabel: "Sending to",
    balanceLabel: "You owe them",
    remaining: (amount) => `${amount} still owed after this`,
    receiptHint: "This is the proof the owner confirms against.",
    reviewNote:
      "Sending this does not settle anything on its own. The owner confirms it once the money reaches them, and their oldest bookings close first.",
    submit: "Send for confirmation",
    editSubmit: "Resend for confirmation",
    busy: "Sending the payout…",
    busyNote: "Sending this to the owner to confirm.",
    empty: "Nothing to send — every booking is settled or already covered by a payout awaiting their confirmation.",
    clears: "This payout would clear",
  },
};

const STAGES: { key: Stage; label: string }[] = [
  { key: "amount", label: "Amount" },
  { key: "details", label: "Details" },
  { key: "review", label: "Review" },
];

export function SendMoneyFlow({
  action,
  direction,
  recipientName,
  clientId,
  claimable,
  bookings,
  backHref,
  editing,
  error,
}: {
  action: (formData: FormData) => void;
  direction: SettlementDirection;
  /** Who the money is going to, as the header names them. */
  recipientName: string;
  /** Whose balance this is against. Only the admin side has to say. */
  clientId?: string;
  claimable: number;
  /** The open bookings behind the balance, oldest first. */
  bookings: OwedBooking[];
  backHref: string;
  editing?: {
    id: string;
    amount: number;
    method: PayoutMethod;
    reference: string | null;
    hasReceipt: boolean;
  } | null;
  error?: string;
}) {
  const copy = COPY[direction];
  const [stage, setStage] = useState<Stage>("amount");
  const [amount, setAmount] = useState(editing ? String(Math.round(editing.amount)) : "");
  const [method, setMethod] = useState<PayoutMethod>(editing?.method ?? "online");
  const [reference, setReference] = useState(editing?.reference ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const value = Number(amount || 0);
  const needsReceipt = methodNeedsReceipt(method);
  const hasProof = Boolean(fileName) || Boolean(editing?.hasReceipt);
  const { lines, unallocated } = previewAllocation(bookings, value);
  const stageIndex = STAGES.findIndex((s) => s.key === stage);

  function toDetails() {
    if (value <= 0) return setWarning("Enter the amount first.");
    setWarning(null);
    setStage("details");
  }

  function toReview() {
    if (needsReceipt && !hasProof) {
      return setWarning("Attach the payment screenshot for an online transfer.");
    }
    setWarning(null);
    setStage("review");
  }

  function back() {
    setWarning(null);
    setStage(stage === "review" ? "details" : "amount");
  }

  if (claimable <= 0 && !editing) {
    return (
      <div className="card p-6 text-center flex flex-col gap-3 items-center">
        <p className="text-sm text-ink-primary">{copy.empty}</p>
        <Link href={backHref} className="btn btn-ghost btn-sm">
          Back to settlements
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {editing && <input type="hidden" name="payout_id" value={editing.id} />}
      {clientId && <input type="hidden" name="client_id" value={clientId} />}
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="reference" value={reference} />

      {/* Who and how much — the one thing on screen at every stage. */}
      <div className="card p-4 flex items-center gap-3">
        <Avatar name={recipientName} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-ink-muted">{copy.recipientLabel}</p>
          <p className="text-sm text-ink-primary truncate">{recipientName}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-ink-muted">{copy.balanceLabel}</p>
          <p className="text-sm text-financial font-medium">{formatPKR(claimable)}</p>
        </div>
      </div>

      <ol className="flex items-center gap-2 px-1" aria-label="Progress">
        {STAGES.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2 flex-1 last:flex-none">
            <span
              className={`text-[11px] transition-colors ${
                i <= stageIndex ? "text-hostello-gold" : "text-ink-muted"
              }`}
            >
              {i < stageIndex ? "✓ " : ""}
              {s.label}
            </span>
            {i < STAGES.length - 1 && (
              <span
                aria-hidden
                className={`h-px flex-1 ${i < stageIndex ? "bg-hostello-gold/40" : "bg-border-hairline"}`}
              />
            )}
          </li>
        ))}
      </ol>

      {error && <p className={errorBanner}>{error}</p>}
      {warning && <p className={errorBanner}>{warning}</p>}

      {/* ── 1. Amount ───────────────────────────────────────────────────── */}
      <div hidden={stage !== "amount"} className="card p-5">
        <AmountKeypad
          value={amount}
          onChange={setAmount}
          max={claimable}
          remainingLabel={(left) => copy.remaining(formatPKR(left))}
        />
      </div>

      {/* ── 2. Method and proof ─────────────────────────────────────────────
          Kept mounted: unmounting this would drop the chosen file. */}
      <div hidden={stage !== "details"} className="card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>How you paid</span>
          <div className="flex gap-2">
            {PAYOUT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                aria-pressed={method === m.value}
                className={`flex-1 text-xs rounded-md border px-3 py-2.5 transition-colors ${
                  method === m.value
                    ? "border-hostello-gold text-ink-primary bg-surface-2"
                    : "border-border-hairline text-ink-secondary hover:border-border-strong"
                }`}
              >
                {m.short}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reference" className={fieldLabel}>
            Reference or note (optional)
          </label>
          <input
            id="reference"
            type="text"
            maxLength={120}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Transaction ID, bank, who it was handed to…"
            className={fieldInput}
          />
        </div>

        {/* Hidden rather than removed for cash, so switching back keeps the file.
            The server drops any stale screenshot a cash entry carries. */}
        <div hidden={!needsReceipt} className="flex flex-col gap-1.5">
          <label htmlFor="receipt" className={fieldLabel}>
            Payment screenshot (PNG, JPG or PDF, up to 8 MB)
          </label>
          <input
            id="receipt"
            name="receipt"
            type="file"
            accept={RECEIPT_ACCEPT}
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? null);
              setWarning(null);
            }}
            className={`${fieldInput} file:mr-3 file:rounded file:border-0 file:bg-surface-3 file:px-2 file:py-1 file:text-xs file:text-ink-secondary`}
          />
          <p className="text-[11px] text-ink-muted">
            {fileName
              ? `Attached: ${fileName}`
              : editing?.hasReceipt
                ? "Leave this empty to keep the screenshot already attached."
                : copy.receiptHint}
          </p>
        </div>
      </div>

      {/* ── 3. Review ───────────────────────────────────────────────────── */}
      <div hidden={stage !== "review"} className="flex flex-col gap-4">
        <div className="card p-5 flex flex-col gap-4">
          <div className="text-center">
            <p className="text-[11px] text-ink-muted">{copy.recipientLabel}</p>
            <p className="text-sm text-ink-primary mt-0.5">{recipientName}</p>
            <p className="text-[2.25rem] leading-none font-semibold text-financial tabular-nums mt-3">
              {formatPKR(value)}
            </p>
          </div>

          <dl className="text-xs divide-y divide-border-hairline border-t border-border-hairline">
            <Row label="Method" value={PAYOUT_METHODS.find((m) => m.value === method)?.label ?? method} />
            {reference && <Row label="Reference" value={reference} />}
            <Row
              label="Proof"
              value={
                needsReceipt ? (
                  <span className="inline-flex items-center gap-1.5 text-ink-primary">
                    <Paperclip size={12} />
                    {fileName ?? "Screenshot already attached"}
                  </span>
                ) : (
                  "Cash — none to attach"
                )
              }
            />
          </dl>
        </div>

        {lines.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-border-hairline">
              <h2 className="text-sm font-medium text-ink-primary">{copy.clears}</h2>
              <p className="text-[11px] text-ink-muted mt-0.5">
                Oldest stay first — the order the allocation actually runs in.
              </p>
            </div>
            <ul className="divide-y divide-border-hairline">
              {lines.map((line) => (
                <li key={line.id} className="px-5 py-3 flex items-center gap-3 text-xs">
                  <span
                    className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                      line.closes
                        ? "bg-hostello-gold/15 text-hostello-gold"
                        : "border border-border-hairline text-ink-muted"
                    }`}
                  >
                    {line.closes ? <Check size={11} /> : "½"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-ink-primary truncate">
                      {line.guestName ?? "Guest"}
                      {line.unitNames.length > 0 && (
                        <span className="text-ink-muted"> · {line.unitNames.join(", ")}</span>
                      )}
                    </span>
                    <span className="block text-ink-muted mt-0.5">
                      {formatDayMonth(line.checkIn)} · {line.closes ? "closes" : "part paid"}
                    </span>
                  </span>
                  <span className="shrink-0 text-financial tabular-nums">
                    {formatPKR(line.applied)}
                  </span>
                </li>
              ))}
            </ul>
            {unallocated > 0 && (
              <p className="px-5 py-3 text-[11px] text-status-pending border-t border-border-hairline">
                {formatPKR(unallocated)} more than the open bookings need. It stays as unallocated
                credit rather than closing anything.
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] text-ink-muted flex gap-2 px-1">
          <ShieldCheck size={14} className="shrink-0 mt-px text-hostello-gold" />
          {copy.reviewNote}
        </p>
      </div>

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {stage === "amount" ? (
          <Link href={backHref} className="btn btn-ghost btn-sm">
            <ArrowLeft size={14} /> Cancel
          </Link>
        ) : (
          <button type="button" onClick={back} className="btn btn-ghost btn-sm">
            <ArrowLeft size={14} /> Back
          </button>
        )}

        {stage === "review" ? (
          <SubmitButton
            className="btn btn-gold flex-1"
            blocking
            busy={needsReceipt ? "Uploading the screenshot…" : copy.busy}
            note={
              needsReceipt
                ? "The screenshot goes up with the payment. Both are saved together or not at all."
                : copy.busyNote
            }
          >
            {editing ? copy.editSubmit : copy.submit}
          </SubmitButton>
        ) : (
          <button
            type="button"
            onClick={stage === "amount" ? toDetails : toReview}
            className="btn btn-gold flex-1"
          >
            Continue
          </button>
        )}
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-ink-muted shrink-0">{label}</dt>
      <dd className="text-ink-primary text-right break-words min-w-0">{value}</dd>
    </div>
  );
}
