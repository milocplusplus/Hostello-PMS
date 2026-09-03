import { FileText, ShieldCheck } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import { formatDayMonth } from "@/lib/calendar";
import {
  methodLabel,
  previewAllocation,
  type OwedBooking,
  type SettlementDirection,
  type SettlementPayment,
} from "@/lib/owed";
import { Avatar } from "@/components/shared/Avatar";
import { SubmitButton } from "@/components/shared/Busy";
import { fieldInput } from "@/lib/form-styles";

/**
 * Money arriving, and the decision only the receiving side can make.
 *
 * This is the mirror of `SendMoneyFlow`: the same payment, seen from the end
 * that either has the money or does not. Everything needed to answer that is on
 * one screen — the amount, how it was sent, the proof full-size rather than as
 * a thumbnail, and exactly which bookings confirming would close.
 *
 * Confirm and reject sit in one `<form>` because the rejection reason has to
 * reach the second button, and `whenAction` is what stops both buttons
 * announcing themselves at once.
 */
const COPY: Record<
  SettlementDirection,
  { fromLabel: string; confirm: string; reject: string; confirmBusy: string; rejectBusy: string; note: string }
> = {
  to_hostello: {
    fromLabel: "Paid by",
    confirm: "Confirm it arrived",
    reject: "Not received",
    confirmBusy: "Confirming the payment…",
    rejectBusy: "Sending it back to the owner…",
    note: "Confirming allocates this across their open bookings, oldest first, and marks Hostello's share received on each one it covers.",
  },
  to_client: {
    fromLabel: "Sent by",
    confirm: "I received this",
    reject: "Not received",
    confirmBusy: "Confirming the payout…",
    rejectBusy: "Sending it back to Hostello…",
    note: "Confirming allocates this across your open bookings, oldest first, and settles each one it covers. Nothing here changes what you are owed until you do.",
  },
};

export function IncomingPayout({
  entry,
  direction,
  from,
  bookings,
  confirmAction,
  rejectAction,
}: {
  entry: SettlementPayment;
  direction: SettlementDirection;
  /** Who sent it, as this side names them. */
  from: string;
  /** The receiving side's open bookings, oldest first. */
  bookings: OwedBooking[];
  confirmAction: (formData: FormData) => void;
  rejectAction: (formData: FormData) => void;
}) {
  const copy = COPY[direction];
  const { lines, unallocated } = previewAllocation(bookings, entry.amount);

  return (
    <div className="flex flex-col gap-4">
      <div className="card overflow-hidden">
        <div className="px-5 pt-7 pb-6 text-center border-b border-border-hairline">
          <span className="inline-block mb-4">
            <Avatar name={from} size={48} />
          </span>
          <p className="text-[2.25rem] leading-none font-semibold text-financial tabular-nums">
            {formatPKR(entry.amount)}
          </p>
          <p className="text-sm text-ink-secondary mt-2.5">
            {copy.fromLabel} {from}
          </p>
          <p className="text-[11px] text-status-pending mt-1.5">
            Waiting on you — nothing has settled
          </p>
        </div>

        <dl className="text-xs px-5 divide-y divide-border-hairline">
          <Row label="Method" value={methodLabel(entry.method)} />
          {entry.reference && <Row label="Reference" value={entry.reference} />}
          <Row label="Receipt no." value={entry.id.slice(0, 8).toUpperCase()} />
        </dl>

        <div className="px-5 py-4 border-t border-border-hairline">
          <p className="text-[11px] text-ink-muted mb-2">Proof of payment</p>
          {entry.receiptUrl ? (
            <a
              href={entry.receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-border-hairline overflow-hidden bg-surface-2 hover:border-border-strong transition-colors"
            >
              {entry.receiptIsPdf ? (
                <span className="flex items-center gap-2 px-4 py-6 text-xs text-ink-secondary justify-center">
                  <FileText size={16} /> Open the PDF
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires; not worth optimizing
                <img
                  src={entry.receiptUrl}
                  alt="Payment screenshot"
                  className="w-full max-h-[420px] object-contain bg-surface-0"
                />
              )}
            </a>
          ) : (
            <p className="text-xs text-ink-muted">
              {entry.method === "cash"
                ? "Cash, handed over — there is no screenshot to check."
                : "No screenshot was attached."}
            </p>
          )}
        </div>
      </div>

      {lines.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-border-hairline">
            <h2 className="text-sm font-medium text-ink-primary">Confirming would clear</h2>
            <p className="text-[11px] text-ink-muted mt-0.5">Oldest stay first.</p>
          </div>
          <ul className="divide-y divide-border-hairline">
            {lines.map((line) => (
              <li key={line.id} className="px-5 py-3 flex items-center gap-3 text-xs">
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

      <form action={confirmAction} className="card p-5 flex flex-col gap-3">
        <input type="hidden" name="id" value={entry.id} />
        <p className="text-[11px] text-ink-muted flex gap-2">
          <ShieldCheck size={14} className="shrink-0 mt-px text-hostello-gold" />
          {copy.note}
        </p>

        <SubmitButton
          className="btn btn-gold w-full"
          blocking
          busy={copy.confirmBusy}
          whenAction={confirmAction}
          note="Allocating it across the bookings it covers."
        >
          {copy.confirm}
        </SubmitButton>

        <div className="flex flex-col gap-2 pt-3 border-t border-border-hairline">
          <input
            name="reason"
            type="text"
            maxLength={140}
            placeholder="What went wrong? (optional)"
            className={`${fieldInput} text-xs py-2`}
          />
          <SubmitButton
            formAction={rejectAction}
            whenAction={rejectAction}
            busy={copy.rejectBusy}
            className="text-xs text-ink-secondary border border-border-hairline rounded-md px-3 py-2 hover:border-status-booked hover:text-status-booked transition-colors"
          >
            {copy.reject}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-ink-muted shrink-0">{label}</dt>
      <dd className="text-ink-primary text-right break-words min-w-0">{value}</dd>
    </div>
  );
}
