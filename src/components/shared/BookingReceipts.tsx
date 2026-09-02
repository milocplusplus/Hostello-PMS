import { FileText, Receipt as ReceiptIcon } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import { formatDayMonth } from "@/lib/calendar";
import { RECEIPT_ACCEPT, RECEIPT_KINDS, receiptKindLabel, type Receipt } from "@/lib/receipts";
import { fieldInput, fieldLabel, errorBanner, secondaryButton } from "@/lib/form-styles";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { SubmitButton } from "@/components/shared/Busy";

/**
 * Token receipts on a booking. Read-only unless an upload action is passed in,
 * which is how the client portal gets the view without the controls.
 */
export function BookingReceipts({
  bookingId,
  receipts,
  uploadAction,
  deleteAction,
  error,
}: {
  bookingId: string;
  receipts: Receipt[];
  uploadAction?: (formData: FormData) => void;
  deleteAction?: (formData: FormData) => void;
  error?: string;
}) {
  return (
    <div className="card p-5">
      <h2 className="text-sm font-medium text-ink-secondary mb-1 flex items-center gap-1.5">
        <ReceiptIcon size={13} /> Token receipts
      </h2>
      <p className="text-[11px] text-ink-muted mb-3">
        Proof of the advance — received from the guest, or paid on to the client.
      </p>

      {receipts.length === 0 && (
        <p className="text-xs text-ink-muted">No receipt attached yet.</p>
      )}

      {receipts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {receipts.map((r) => (
            <div key={r.id} className="flex flex-col gap-1.5">
              <a
                href={r.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md border border-border-hairline overflow-hidden bg-surface-2 aspect-[3/4] hover:border-border-strong transition-colors"
              >
                {r.isPdf || !r.url ? (
                  <span className="h-full w-full flex flex-col items-center justify-center gap-1.5 text-ink-muted text-[11px]">
                    <FileText size={20} />
                    {r.url ? "PDF receipt" : "Unavailable"}
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires; not worth optimizing
                  <img src={r.url} alt={receiptKindLabel(r.kind)} className="h-full w-full object-cover" />
                )}
              </a>
              <p className="text-[11px] text-ink-secondary leading-tight">
                {RECEIPT_KINDS.find((k) => k.value === r.kind)?.short ?? r.kind}
                {r.amount != null && <span className="text-financial"> · {formatPKR(r.amount)}</span>}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-ink-muted">{formatDayMonth(r.created_at.slice(0, 10))}</span>
                {deleteAction && (
                  <form action={deleteAction} className="ml-auto">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="booking_id" value={bookingId} />
                    <ConfirmDeleteButton
                      confirmText="Remove this receipt?"
                      label="Remove"
                      className="text-[11px] text-ink-muted hover:text-status-booked transition-colors"
                    />
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {uploadAction && (
        <form action={uploadAction} className="mt-4 pt-4 border-t border-border-hairline flex flex-col gap-3">
          <input type="hidden" name="booking_id" value={bookingId} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="receipt_kind" className={fieldLabel}>
                This receipt is for
              </label>
              <select id="receipt_kind" name="receipt_kind" className={fieldInput}>
                {RECEIPT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="receipt_amount" className={fieldLabel}>
                Amount on the receipt (PKR, optional)
              </label>
              <input
                id="receipt_amount"
                name="receipt_amount"
                type="number"
                min="0"
                step="1"
                className={fieldInput}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="receipt" className={fieldLabel}>
              Screenshot (PNG, JPG or PDF, up to 8 MB)
            </label>
            <input
              id="receipt"
              name="receipt"
              type="file"
              required
              accept={RECEIPT_ACCEPT}
              className={`${fieldInput} file:mr-3 file:rounded file:border-0 file:bg-surface-3 file:px-2 file:py-1 file:text-xs file:text-ink-secondary`}
            />
          </div>

          {error && <p className={errorBanner}>{error}</p>}

          <SubmitButton
            className={`${secondaryButton} self-start`}
            busy="Uploading the receipt…"
            blocking
            note="The photo is on its way to storage. This takes a moment on a slow connection."
          >
            Attach receipt
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
