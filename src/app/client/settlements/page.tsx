import { EmptyState } from "@/components/shared/PageHeader";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, CircleCheck, Clock, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import { listPayments, loadOwed, type SettlementDirection } from "@/lib/owed";
import { PayoutHistory } from "@/components/shared/PayoutHistory";
import { OwedBookings } from "@/components/shared/OwedBookings";
import { MoneyStat, SettlementTabs, isSettlementTab } from "@/components/shared/SettlementTabs";
import { InfoSheet } from "@/components/shared/InfoSheet";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { SubmitButton } from "@/components/shared/Busy";
import { errorBanner } from "@/lib/form-styles";
import { unconfirmHostelloPayout, withdrawPayout } from "./actions";

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
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const { tab: rawTab, error } = await searchParams;
  const tab = isSettlementTab(rawTab) ? rawTab : "to-hostello";
  const direction: SettlementDirection = tab === "to-hostello" ? "to_hostello" : "to_client";

  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const supabase = await createClient();
  const [toHostello, toClient, entries] = await Promise.all([
    loadOwed(supabase, clientRecord.id, "to_hostello"),
    loadOwed(supabase, clientRecord.id, "to_client"),
    listPayments(supabase, direction, clientRecord.id),
  ]);

  const owed = direction === "to_hostello" ? toHostello : toClient;
  const pending = entries.filter((e) => e.status === "pending");
  const confirmedToDate = entries
    .filter((e) => e.status === "received")
    .reduce((s, e) => s + e.amount, 0);

  // What is left to claim after the entries already waiting on the other side.
  const claimable = Math.max(0, Math.round((owed.balance - owed.pending) * 100) / 100);

  return (
    <div className="flex flex-col gap-4 stagger">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] md:text-3xl">Money</h1>
        <InfoSheet title="How settling works" className="bg-white/8 text-ink-secondary">
          <p>
            What you owe Hostello and what Hostello owes you are kept apart. Neither moves until the
            side receiving the money confirms it arrived.
          </p>
          <p>A confirmed payment clears your oldest bookings first.</p>
        </InfoSheet>
      </div>

      <SettlementTabs
        portal="client"
        tab={tab}
        toHostello={toHostello.balance}
        toClient={toClient.balance}
      />

      {error && <p className={errorBanner}>{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <MoneyStat
          icon={Clock}
          tint="bg-amber-300/15 text-status-pending"
          label={tab === "to-hostello" ? "Awaiting Hostello" : "Waiting on you"}
          value={owed.pending}
          valueClass="text-status-pending"
        />
        <MoneyStat
          icon={CircleCheck}
          tint="bg-emerald-400/15 text-positive"
          label="Confirmed"
          value={confirmedToDate}
        />
      </div>

      {tab === "to-hostello" ? (
        <Link
          href="/client/settlements/send"
          className="btn btn-primary h-auto justify-start gap-3 p-4 rounded-3xl"
        >
          <span className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <Send size={20} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-base font-extrabold">Pay Hostello</span>
            <span className="block text-xs font-semibold text-white/80 mt-0.5 whitespace-normal">
              {claimable > 0 ? `Up to ${formatPKR(claimable)}` : "Nothing to pay right now"}
            </span>
          </span>
          <ChevronRight size={20} className="shrink-0" />
        </Link>
      ) : (
        <section className={`card overflow-hidden ${pending.length > 0 ? "pulse-gold" : ""}`}>
          <div className="px-4 md:px-5 py-3.5 border-b border-white/5 flex items-center justify-between gap-3">
            <h2 className="text-lg">Waiting on you</h2>
            <InfoSheet title="Waiting on you" className="bg-white/8 text-ink-secondary">
              <p>
                Hostello has recorded these as sent. Nothing settles until you confirm the money
                reached you, and confirming clears your oldest bookings first.
              </p>
            </InfoSheet>
          </div>

          {pending.length === 0 ? (
            <div className="p-3">
              <EmptyState inset icon={CircleCheck} title="Nothing to confirm." />
            </div>
          ) : (
            <PayoutHistory
              entries={pending}
              receiptHref={(e) => `/client/settlements/receipt/${e.id}`}
              actions={(e) => (
                <Link href={`/client/settlements/review/${e.id}`} className="btn btn-gold">
                  Review
                </Link>
              )}
            />
          )}
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="px-4 md:px-5 py-3.5 border-b border-white/5 flex items-center justify-between gap-3">
          <h2 className="text-lg">Open bookings</h2>
          <InfoSheet title="Open bookings" className="bg-white/8 text-ink-secondary">
            <p>What makes up the balance, oldest stay first: the order payments clear them in.</p>
          </InfoSheet>
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
        <div className="px-4 md:px-5 py-3.5 border-b border-white/5">
          <h2 className="text-lg">History</h2>
        </div>
        <PayoutHistory
          entries={entries}
          receiptHref={(e) => `/client/settlements/receipt/${e.id}`}
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
                    href={`/client/settlements/send?edit=${e.id}`}
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
