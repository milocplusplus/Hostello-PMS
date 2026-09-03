import Link from "next/link";
import { ArrowLeft, ChevronRight, Clock, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatPKR } from "@/lib/payout";
import {
  listPayments,
  loadOwed,
  loadOwedByClient,
  type SettlementDirection,
} from "@/lib/owed";
import { PayoutHistory } from "@/components/shared/PayoutHistory";
import { OwedBookings } from "@/components/shared/OwedBookings";
import { SettlementTabs, isSettlementTab } from "@/components/shared/SettlementTabs";
import { Avatar } from "@/components/shared/Avatar";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { errorBanner } from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import {
  confirmPayoutForClient,
  markShareReceived,
  unconfirmPayout,
  unconfirmSentPayout,
  withdrawSentPayout,
} from "./actions";

/**
 * Both directions of settlement, on one screen.
 *
 * Nothing here decides what anyone earns — `payout.ts` did that when the
 * booking was written. This page only tracks two questions per booking: has
 * Hostello been paid its share, and has the owner been paid theirs. They are
 * independent, run opposite ways, and each is closed by the side that receives
 * the money — which is why Hostello can record a payout here but cannot settle
 * one.
 */
export default async function AdminSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; client?: string; error?: string }>;
}) {
  const { tab: rawTab, client: clientParam, error } = await searchParams;
  const tab = isSettlementTab(rawTab) ? rawTab : "to-hostello";
  const direction: SettlementDirection = tab === "to-hostello" ? "to_hostello" : "to_client";

  const supabase = await createClient();
  const [toHostello, toClient, entries] = await Promise.all([
    loadOwedByClient(supabase, "to_hostello"),
    loadOwedByClient(supabase, "to_client"),
    listPayments(supabase, direction, null),
  ]);

  const balances = direction === "to_hostello" ? toHostello : toClient;
  // Owners with no portal login can never confirm a payout themselves, so
  // Hostello is allowed to record one as received for them — and only them.
  const noLogin = new Set(toClient.filter((b) => !b.hasLogin).map((b) => b.clientId));
  const owing = balances.filter((b) => b.balance > 0);
  const focus = clientParam ? balances.find((b) => b.clientId === clientParam) ?? null : null;

  const focusOwed = focus
    ? await loadOwed(supabase, focus.clientId, direction)
    : null;

  const pending = entries.filter((e) => e.status === "pending");
  const reviewed = entries.filter((e) => e.status !== "pending");
  const pendingTotal = pending.reduce((s, e) => s + e.amount, 0);
  const confirmedTotal = entries
    .filter((e) => e.status === "received")
    .reduce((s, e) => s + e.amount, 0);

  // What is left to send after the payouts already awaiting their confirmation.
  // The send flow re-derives this itself; here it only sizes the invitation.
  const claimable = focusOwed
    ? Math.max(0, Math.round((focusOwed.balance - focusOwed.pending) * 100) / 100)
    : 0;

  const toHostelloTotal = toHostello.reduce((s, b) => s + b.balance, 0);
  const toClientTotal = toClient.reduce((s, b) => s + b.balance, 0);

  return (
    <div className="flex flex-col gap-4 animate-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Settlements</h1>
        <p className="text-sm text-ink-secondary mt-1.5">
          Who still owes whom on every confirmed booking, and the payments that clear it. A payment
          settles nothing until the side receiving it says it arrived.
        </p>
      </div>

      <SettlementTabs
        portal="admin"
        tab={tab}
        toHostello={toHostelloTotal}
        toClient={toClientTotal}
      />

      {error && <p className={errorBanner}>{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 md:p-6">
          <p className="text-ink-muted text-xs flex items-center gap-1">
            <Clock size={12} />
            {tab === "to-hostello" ? "Needs confirming" : "Awaiting their confirmation"}
          </p>
          <p className="text-lg md:text-2xl font-semibold mt-2 truncate text-status-pending">
            {formatPKR(pendingTotal)}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            {pending.length === 0
              ? tab === "to-hostello"
                ? "Nothing waiting on you"
                : "Nothing waiting on a client"
              : `${pending.length} ${pending.length === 1 ? "entry" : "entries"}`}
          </p>
        </div>
        <div className="card p-4 md:p-6">
          <p className="text-ink-muted text-xs">Confirmed to date</p>
          <p className="text-lg md:text-2xl font-semibold mt-2 truncate text-ink-primary">
            {formatPKR(confirmedTotal)}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            {tab === "to-hostello" ? "Payments you marked received" : "Payouts clients confirmed"}
          </p>
        </div>
      </div>

      {tab === "to-hostello" && (
        <section className="card overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
            <h2 className="text-sm font-medium text-ink-primary">Waiting on you</h2>
            <p className="text-[11px] text-ink-muted mt-0.5">
              A payment counts for nothing until you confirm it. Confirming clears the client&apos;s
              oldest bookings first.
            </p>
          </div>

          {pending.length === 0 ? (
            <p className="text-xs text-ink-muted px-5 py-6">No payments waiting to be confirmed.</p>
          ) : (
            <PayoutHistory
              entries={pending}
              showClient
              receiptHref={(e) => `/admin/settlements/receipt/${e.id}`}
              actions={(e) => (
                <Link href={`/admin/settlements/review/${e.id}`} className="btn btn-gold btn-sm">
                  Review this payment
                </Link>
              )}
            />
          )}
        </section>
      )}

      {focus && focusOwed ? (
        <section className="card overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-border-hairline flex items-center gap-3">
            <Avatar name={focus.clientName} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-ink-primary truncate">{focus.clientName}</span>
              <span className="block text-[11px] text-ink-muted">
                {tab === "to-hostello"
                  ? "What they owe Hostello, oldest stay first"
                  : "What Hostello owes them, oldest stay first"}
              </span>
            </span>
            <Link
              href={`/admin/settlements?tab=${tab}`}
              className="text-xs text-ink-muted hover:text-ink-primary transition-colors flex items-center gap-1"
            >
              <ArrowLeft size={12} /> All clients
            </Link>
          </div>

          <OwedBookings
            bookings={focusOwed.bookings}
            hrefBase="/admin/bookings"
            empty={
              tab === "to-hostello"
                ? "Nothing owed on this client's bookings."
                : "Nothing owed to this client right now."
            }
            actions={
              tab === "to-hostello"
                ? (b) => (
                    // The one settlement Hostello can close alone, because no
                    // money has to move: it kept its share out of what it held.
                    <form action={markShareReceived}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="received" value="true" />
                      <input type="hidden" name="client" value={focus.clientId} />
                      <SubmitButton
                        className="btn btn-ghost btn-sm whitespace-nowrap"
                        busy="Marking the share received…"
                      >
                        Kept by Hostello
                      </SubmitButton>
                    </form>
                  )
                : undefined
            }
          />
        </section>
      ) : null}

      {tab === "to-client" && (
        <Link
          href={
            focus ? `/admin/settlements/send?client=${focus.clientId}` : "/admin/settlements/send"
          }
          className="card card-hover p-4 flex items-center gap-3"
        >
          <span className="w-10 h-10 rounded-full bg-hostello-gold/15 text-hostello-gold flex items-center justify-center shrink-0">
            <Send size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-ink-primary truncate">
              {focus ? `Send ${focus.clientName} a payout` : "Send a payout"}
            </span>
            <span className="block text-[11px] text-ink-muted mt-0.5">
              {focus
                ? claimable > 0
                  ? `Up to ${formatPKR(claimable)} right now`
                  : "Nothing left to send — every booking is settled or awaiting their confirmation"
                : "Pick who it is for, then the amount"}
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-ink-muted" />
        </Link>
      )}

      <section className="card overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-border-hairline flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink-primary">
            {tab === "to-hostello" ? "Owed by client" : "Owed to client"}
          </h2>
          <span className="text-xs text-ink-muted">
            {owing.length} of {balances.length}
          </span>
        </div>

        {owing.length === 0 ? (
          <p className="text-xs text-ink-muted px-5 py-6">
            {tab === "to-hostello"
              ? "No client owes anything right now."
              : "Hostello owes no client anything right now."}
          </p>
        ) : (
          <ul className="divide-y divide-border-hairline">
            {owing.map((b) => (
              <li key={b.clientId}>
                <Link
                  href={`/admin/settlements?tab=${tab}&client=${b.clientId}`}
                  className="flex items-center gap-3 px-4 md:px-5 py-3 hover:bg-surface-2 transition-colors"
                >
                  <Avatar name={b.clientName} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink-primary truncate">{b.clientName}</span>
                    <span className="block text-xs text-ink-muted">
                      {b.bookings} {b.bookings === 1 ? "booking" : "bookings"} open
                    </span>
                  </span>
                  <span className="text-sm text-financial whitespace-nowrap">
                    {formatPKR(b.balance)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
          <h2 className="text-sm font-medium text-ink-primary">
            {tab === "to-hostello" ? "Reviewed" : "Payouts sent"}
          </h2>
          {tab === "to-client" && (
            <p className="text-[11px] text-ink-muted mt-0.5">
              Each one waits on the owner — nothing settles until they confirm it arrived. An owner
              with no portal login has no way to, so those you mark received yourself.
            </p>
          )}
        </div>
        <PayoutHistory
          entries={tab === "to-hostello" ? reviewed : entries}
          showClient
          receiptHref={(e) => `/admin/settlements/receipt/${e.id}`}
          empty={
            tab === "to-hostello" ? "Nothing reviewed yet." : "No payout recorded yet."
          }
          actions={(e) =>
            tab === "to-hostello" ? (
              e.status === "received" ? (
                <form action={unconfirmPayout}>
                  <input type="hidden" name="id" value={e.id} />
                  <SubmitButton
                    className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                    busy="Un-confirming the payment…"
                  >
                    Un-confirm
                  </SubmitButton>
                </form>
              ) : null
            ) : e.status === "received" ? (
              <form action={unconfirmSentPayout}>
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="client" value={e.clientId} />
                <SubmitButton
                  className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                  busy="Un-confirming the payout…"
                >
                  Un-confirm
                </SubmitButton>
              </form>
            ) : (
              <>
                {noLogin.has(e.clientId) && (
                  // The only case where the side receiving the money is not the
                  // side that ticks it. The RPC refuses if they have a login.
                  <form action={confirmPayoutForClient}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="client" value={e.clientId} />
                    <SubmitButton
                      className="btn btn-gold btn-sm whitespace-nowrap"
                      busy="Recording it as received…"
                    >
                      Mark received for them
                    </SubmitButton>
                  </form>
                )}
                <Link
                  href={`/admin/settlements/send?client=${e.clientId}&edit=${e.id}`}
                  className="text-xs text-ink-secondary hover:text-ink-primary transition-colors"
                >
                  {e.status === "rejected" ? "Correct & resend" : "Edit"}
                </Link>
                <form action={withdrawSentPayout}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="client" value={e.clientId} />
                  <ConfirmDeleteButton
                    confirmText="Withdraw this payout entry?"
                    label="Withdraw"
                    busy="Withdrawing the entry…"
                    className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                  />
                </form>
              </>
            )
          }
        />
      </section>
    </div>
  );
}
