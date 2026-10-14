import { HandCoins } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import { formatDayMonth, todayISO } from "@/lib/calendar";
import { methodLabel } from "@/lib/owed";
import type { BalancePayment } from "@/lib/balance-payments";
import { errorBanner, fieldInput, fieldLabel, secondaryButton } from "@/lib/form-styles";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { SubmitButton } from "@/components/shared/Busy";

type Action = (formData: FormData) => void;

const chip =
  "flex items-center rounded-full border border-border-hairline px-3 py-1.5 text-xs text-ink-secondary cursor-pointer transition-colors hover:border-border-strong has-[:checked]:border-hostello-purple-light has-[:checked]:bg-hostello-purple-glow/20 has-[:checked]:text-ink-primary has-[:checked]:font-semibold";

/**
 * "Record a guest payment" — the amount, who took it, cash or online, and the
 * day. Folded away until asked for, so it fits on a Today or Money row as well
 * as the booking page. Whether it counts at once or waits for the admin is the
 * action's business, and `note` says which to the person filling it in.
 */
export function RecordPaymentForm({
  bookingId,
  left,
  back,
  action,
  ownerView = false,
  note,
  label = "Record guest payment",
  open = false,
}: {
  bookingId: string;
  /** What is still to record: the balance, less entries already waiting. */
  left: number;
  back: string;
  action: Action;
  /** The owner's portal says "Me" where staff see "Owner". */
  ownerView?: boolean;
  note?: string;
  label?: string;
  open?: boolean;
}) {
  if (left <= 0) return null;
  return (
    <details className="group" open={open}>
      <summary className={`${secondaryButton} list-none cursor-pointer self-start inline-flex`}>
        <HandCoins size={13} /> {label}
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="booking_id" value={bookingId} />
        <input type="hidden" name="back" value={back} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`amount-${bookingId}`} className={fieldLabel}>
              Amount paid (PKR)
            </label>
            <input
              id={`amount-${bookingId}`}
              name="amount"
              type="number"
              min="1"
              max={left}
              step="1"
              required
              defaultValue={left}
              className={fieldInput}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`paid-on-${bookingId}`} className={fieldLabel}>
              Paid on
            </label>
            <input
              id={`paid-on-${bookingId}`}
              name="paid_on"
              type="date"
              max={todayISO()}
              defaultValue={todayISO()}
              className={fieldInput}
            />
          </div>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className={`${fieldLabel} mb-1.5`}>Who received it</legend>
          <div className="flex flex-wrap gap-2">
            <label className={chip}>
              <input type="radio" name="received_by" value="hostello" required className="sr-only" />
              Hostello
            </label>
            <label className={chip}>
              <input type="radio" name="received_by" value="owner" required className="sr-only" />
              {ownerView ? "Me" : "Owner"}
            </label>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className={`${fieldLabel} mb-1.5`}>How</legend>
          <div className="flex flex-wrap gap-2">
            <label className={chip}>
              <input type="radio" name="method" value="cash" defaultChecked className="sr-only" />
              Cash
            </label>
            <label className={chip}>
              <input type="radio" name="method" value="online" className="sr-only" />
              Online transfer
            </label>
          </div>
        </fieldset>

        <input name="note" placeholder="Note (optional)" className={fieldInput} />

        {note && <p className="text-[11px] text-ink-muted">{note}</p>}

        <SubmitButton className={`${secondaryButton} self-start`} busy="Saving the payment…">
          Save payment
        </SubmitButton>
      </form>
    </details>
  );
}

const STATUS: Record<BalancePayment["status"], { label: string; tone: string }> = {
  pending: { label: "Waiting for approval", tone: "text-status-pending" },
  received: { label: "Counted", tone: "text-financial" },
  rejected: { label: "Turned down", tone: "text-status-booked" },
};

/**
 * The guest's payments after the advance, on the booking's Payment card. The
 * admin approves or turns down what is waiting and can take back anything;
 * whoever filed an entry can withdraw it while it waits.
 */
export function BalancePaymentList({
  payments,
  back,
  viewerId,
  ownerView = false,
  reviewAction,
  withdrawAction,
  isAdmin = false,
}: {
  payments: BalancePayment[];
  back: string;
  viewerId: string | null;
  ownerView?: boolean;
  reviewAction?: Action;
  withdrawAction?: Action;
  isAdmin?: boolean;
}) {
  if (payments.length === 0) return null;
  const who = (c: string) => (c === "hostello" ? "Hostello" : ownerView ? "you" : "the owner");

  return (
    <ul className="flex flex-col divide-y divide-[var(--color-border-hairline)] border-t border-border-hairline">
      {payments.map((p) => {
        const canWithdraw =
          withdrawAction && (isAdmin || (p.status === "pending" && p.recordedBy === viewerId));
        return (
          <li key={p.id} className="py-2.5 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-ink-primary">
                  <span className="num font-semibold">{formatPKR(p.amount)}</span> to {who(p.receivedBy)}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {formatDayMonth(p.paidOn)} · {methodLabel(p.method)}
                  {p.note ? ` · ${p.note}` : ""}
                  {p.status === "rejected" && p.reviewNote ? ` · ${p.reviewNote}` : ""}
                </p>
              </div>
              <span className={`text-[11px] font-semibold shrink-0 ${STATUS[p.status].tone}`}>
                {STATUS[p.status].label}
              </span>
            </div>

            {(reviewAction && p.status === "pending") || canWithdraw ? (
              <div className="flex items-center gap-2 flex-wrap">
                {reviewAction && p.status === "pending" && (
                  <>
                    <form action={reviewAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="booking_id" value={p.bookingId} />
                      <input type="hidden" name="back" value={back} />
                      <input type="hidden" name="decision" value="approve" />
                      <SubmitButton className="btn btn-gold btn-sm" busy="Approving…">
                        Approve
                      </SubmitButton>
                    </form>
                    <form action={reviewAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="booking_id" value={p.bookingId} />
                      <input type="hidden" name="back" value={back} />
                      <input type="hidden" name="decision" value="reject" />
                      <input name="reason" placeholder="Why not (optional)" className={`${fieldInput} !py-1 text-xs`} />
                      <SubmitButton className={secondaryButton} busy="Turning it down…">
                        Turn down
                      </SubmitButton>
                    </form>
                  </>
                )}
                {canWithdraw && (
                  <form action={withdrawAction} className="ml-auto">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="booking_id" value={p.bookingId} />
                    <input type="hidden" name="back" value={back} />
                    <ConfirmDeleteButton
                      confirmText={
                        p.status === "received"
                          ? "Take back this payment? The balance and what each side owes go back to before it."
                          : "Withdraw this payment?"
                      }
                      label={p.status === "pending" ? "Withdraw" : "Remove"}
                      className="text-[11px] text-ink-muted hover:text-status-booked transition-colors"
                    />
                  </form>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** A record-form error, shown only beside the stay it was about. */
export function PaymentError({ error }: { error?: string | null }) {
  return error ? <p className={errorBanner}>{error}</p> : null;
}
