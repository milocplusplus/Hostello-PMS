import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import { listPayments, loadOwed, type SettlementDirection } from "@/lib/owed";
import { RecordPaymentForm } from "@/components/shared/RecordPaymentForm";
import { PayoutHistory } from "@/components/shared/PayoutHistory";
import { OwedBookings } from "@/components/shared/OwedBookings";
import { SettlementTabs, isSettlementTab } from "@/components/shared/SettlementTabs";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { SubmitButton } from "@/components/shared/Busy";
import { errorBanner, fieldInput } from "@/lib/form-styles";
import {
  confirmHostelloPayout,
  recordPayout,
  rejectHostelloPayout,
  unconfirmHostelloPayout,
  withdrawPayout,
} from "./actions";

/**
 * The owner's side of both directions.
 *
 * What they owe Hostello they record and Hostello confirms; what Hostello owes
 * them Hostello records and *they* confirm. Neither tick is anyone else's to
 * make, which is the whole reason the two live side by side here instead of on
 * a booking.
 */
export default async function ClientSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; edit?: string; error?: string }>;
}) {
  const { tab: rawTab, edit, error } = await searchParams;
  const tab = isSettlementTab(rawTab) ? rawTab : "to-hostello";
  const direction: SettlementDirection = tab === "to-hostello" ? "to_hostello" : "to_client";

  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const supabase = await createClient();
  const [toHostello, toClient, entries] = await Promise.all([
    loadOwed(supabase, clientRecord.id, "to_hostello", {
      excludePayoutId: tab === "to-hostello" ? edit ?? null : null,
    }),
    loadOwed(supabase, clientRecord.id, "to_client"),
    listPayments(supabase, direction, clientRecord.id),
  ]);

  const owed = direction === "to_hostello" ? toHostello : toClient;
  const editing = edit ? entries.find((e) => e.id === edit && e.status !== "received") : null;
  const pending = entries.filter((e) => e.status === "pending");
  const confirmedToDate = entries
    .filter((e) => e.status === "received")
    .reduce((s, e) => s + e.amount, 0);

  // What is left to claim after the entries already waiting on the other side.
  const claimable = Math.max(0, Math.round((owed.balance - owed.pending) * 100) / 100);

  return (
    <div className="flex flex-col gap-4 animate-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Settlements</h1>
        <p className="text-sm text-ink-secondary mt-1.5">
          What you owe Hostello and what Hostello owes you, kept apart. Neither moves until the side
          receiving the money confirms it arrived.
        </p>
      </div>

      <SettlementTabs
        portal="client"
        tab={tab}
        toHostello={toHostello.balance}
        toClient={toClient.balance}
      />

      {error && <p className={errorBanner}>{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 md:p-6">
          <p className="text-ink-muted text-xs flex items-center gap-1">
            <Clock size={12} />
            {tab === "to-hostello" ? "Awaiting confirmation" : "Waiting on you"}
          </p>
          <p className="text-lg md:text-2xl font-semibold mt-2 truncate text-status-pending">
            {formatPKR(owed.pending)}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            {owed.pending > 0
              ? tab === "to-hostello"
                ? "Still counted as owed until Hostello confirms"
                : "Confirm it once the money reaches you"
              : "Nothing waiting"}
          </p>
        </div>
        <div className="card p-4 md:p-6">
          <p className="text-ink-muted text-xs">Confirmed to date</p>
          <p className="text-lg md:text-2xl font-semibold mt-2 truncate text-ink-primary">
            {formatPKR(confirmedToDate)}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            {tab === "to-hostello"
              ? "Payments Hostello has marked received"
              : "Payouts you have confirmed receiving"}
          </p>
        </div>
      </div>

      {tab === "to-hostello" ? (
        <RecordPaymentForm
          action={recordPayout}
          direction="to_hostello"
          claimable={claimable}
          cancelHref="/client/settlements?tab=to-hostello"
          editing={
            editing
              ? {
                  id: editing.id,
                  amount: editing.amount,
                  method: editing.method,
                  reference: editing.reference,
                  hasReceipt: Boolean(editing.receiptUrl),
                }
              : null
          }
        />
      ) : (
        <section className="card overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
            <h2 className="text-sm font-medium text-ink-primary">Waiting on you</h2>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Hostello has recorded these as sent. Nothing settles until you confirm the money
              reached you — confirming clears your oldest bookings first.
            </p>
          </div>

          {pending.length === 0 ? (
            <p className="text-xs text-ink-muted px-5 py-6">
              No payout is waiting for your confirmation.
            </p>
          ) : (
            <PayoutHistory
              entries={pending}
              actions={(e) => (
                // One form, two verbs: the reason belongs to the second button
                // but has to sit in the same form to reach it.
                <form
                  action={confirmHostelloPayout}
                  className="flex flex-wrap items-center gap-2 w-full"
                >
                  <input type="hidden" name="id" value={e.id} />
                  <SubmitButton
                    className="btn btn-gold btn-sm"
                    busy="Confirming the payout…"
                    whenAction={confirmHostelloPayout}
                  >
                    I received this
                  </SubmitButton>
                  <input
                    name="reason"
                    type="text"
                    maxLength={140}
                    placeholder="Why not? (optional)"
                    className={`${fieldInput} text-xs py-1.5 flex-1 min-w-[160px]`}
                  />
                  <SubmitButton
                    formAction={rejectHostelloPayout}
                    whenAction={rejectHostelloPayout}
                    busy="Sending it back to Hostello…"
                    className="text-xs text-ink-secondary border border-border-hairline rounded-md px-3 py-1.5 hover:border-status-booked hover:text-status-booked transition-colors"
                  >
                    Not received
                  </SubmitButton>
                </form>
              )}
            />
          )}
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
          <h2 className="text-sm font-medium text-ink-primary">What makes up the balance</h2>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Oldest stay first — that is the order payments clear them in.
          </p>
        </div>
        <OwedBookings
          bookings={owed.bookings}
          hrefBase="/client/bookings"
          empty={
            tab === "to-hostello"
              ? "Nothing owed. Every confirmed booking's share is either received or was kept by Hostello out of money it already held."
              : "Nothing owed to you. Bookings you sourced yourself are not here — you collected that money, so Hostello has nothing to send."
          }
        />
      </section>

      <section className="card overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
          <h2 className="text-sm font-medium text-ink-primary">
            {tab === "to-hostello" ? "Your payments" : "Payouts from Hostello"}
          </h2>
        </div>
        <PayoutHistory
          entries={entries}
          empty={
            tab === "to-hostello"
              ? "You haven't recorded a payment yet."
              : "Hostello hasn't recorded a payout to you yet."
          }
          actions={(e) =>
            tab === "to-hostello" ? (
              e.status === "received" ? null : (
                <>
                  <Link
                    href={`/client/settlements?tab=to-hostello&edit=${e.id}`}
                    className="text-xs text-ink-secondary hover:text-ink-primary transition-colors"
                  >
                    {e.status === "rejected" ? "Correct & resubmit" : "Edit"}
                  </Link>
                  {e.status === "pending" && (
                    <form action={withdrawPayout}>
                      <input type="hidden" name="id" value={e.id} />
                      <ConfirmDeleteButton
                        confirmText="Withdraw this payment entry?"
                        label="Withdraw"
                        busy="Withdrawing the entry…"
                        className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                      />
                    </form>
                  )}
                </>
              )
            ) : e.status === "received" ? (
              <form action={unconfirmHostelloPayout}>
                <input type="hidden" name="id" value={e.id} />
                <SubmitButton
                  className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                  busy="Un-confirming the payout…"
                >
                  Confirmed by mistake
                </SubmitButton>
              </form>
            ) : null
          }
        />
      </section>
    </div>
  );
}
