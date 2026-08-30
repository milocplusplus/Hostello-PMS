import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { formatDayMonth } from "@/lib/calendar";
import { formatPKR } from "@/lib/payout";
import { sourceLabel } from "@/lib/block-sources";
import { listClientPayouts, loadOwed } from "@/lib/owed";
import { RecordPayoutForm } from "@/components/client/RecordPayoutForm";
import { PayoutHistory } from "@/components/shared/PayoutHistory";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { recordPayout, withdrawPayout } from "./actions";

export default async function ClientPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const { error, edit } = await searchParams;

  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const supabase = await createClient();
  const [owed, entries] = await Promise.all([
    loadOwed(supabase, clientRecord.id, { excludePayoutId: edit ?? null }),
    listClientPayouts(supabase, clientRecord.id),
  ]);

  const editing = edit ? entries.find((e) => e.id === edit && e.status !== "received") : null;
  const paidToDate = entries
    .filter((e) => e.status === "received")
    .reduce((s, e) => s + e.amount, 0);

  // What is left to claim after the entries already waiting on an admin.
  const claimable = Math.max(0, Math.round((owed.balance - owed.pending) * 100) / 100);

  return (
    <div className="flex flex-col gap-4 animate-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Owed to Hostello</h1>
        <p className="text-sm text-ink-secondary mt-1.5">
          Hostello&apos;s share of the bookings where you collected the guest&apos;s money.
          Record what you send and Hostello confirms it landed.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="card p-4 md:p-6 border border-hostello-gold/30">
          <p className="text-ink-muted text-xs">Owed now</p>
          <p className="text-lg md:text-2xl font-semibold mt-2 truncate text-financial">
            {formatPKR(owed.balance)}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            {owed.bookings.length === 0
              ? "Nothing outstanding"
              : `Across ${owed.bookings.length} ${owed.bookings.length === 1 ? "booking" : "bookings"}`}
          </p>
        </div>
        <div className="card p-4 md:p-6">
          <p className="text-ink-muted text-xs flex items-center gap-1">
            <Clock size={12} /> Awaiting confirmation
          </p>
          <p className="text-lg md:text-2xl font-semibold mt-2 truncate text-status-pending">
            {formatPKR(owed.pending)}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            {owed.pending > 0 ? "Still counted as owed until confirmed" : "Nothing waiting"}
          </p>
        </div>
        <div className="card p-4 md:p-6 col-span-2 lg:col-span-1">
          <p className="text-ink-muted text-xs">Confirmed to date</p>
          <p className="text-lg md:text-2xl font-semibold mt-2 truncate text-ink-primary">
            {formatPKR(paidToDate)}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">Payments Hostello has marked received</p>
        </div>
      </div>

      <RecordPayoutForm
        action={recordPayout}
        claimable={claimable}
        error={error}
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

      <section className="card overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
          <h2 className="text-sm font-medium text-ink-primary">What makes up the balance</h2>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Oldest stay first — that is the order your payments clear them in.
          </p>
        </div>

        {owed.bookings.length === 0 ? (
          <p className="text-xs text-ink-muted px-5 py-6">
            Nothing owed. Every confirmed booking&apos;s share is either received or was kept by
            Hostello out of money it already held.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm md:min-w-[560px]">
              <thead>
                <tr className="text-left text-ink-muted text-xs border-b border-border-hairline">
                  <th className="px-4 md:px-5 py-2.5 font-normal">Booking</th>
                  <th className="px-4 py-2.5 font-normal hidden sm:table-cell">Channel</th>
                  <th className="px-4 py-2.5 font-normal text-right">Share</th>
                  <th className="px-4 md:px-5 py-2.5 font-normal text-right">Still owed</th>
                </tr>
              </thead>
              <tbody>
                {owed.bookings.map((b) => (
                  <tr key={b.id} className="border-b border-border-hairline last:border-0">
                    <td className="px-4 md:px-5 py-3">
                      <Link href={`/client/bookings/${b.id}`} className="block min-w-0">
                        <span className="block text-ink-primary truncate">
                          {b.guestName ?? "Guest"}
                        </span>
                        <span className="block text-xs text-ink-secondary truncate">
                          {b.unitNames.join(", ") || "—"} · {formatDayMonth(b.checkIn)} →{" "}
                          {formatDayMonth(b.checkOut)}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-secondary text-xs hidden sm:table-cell">
                      {sourceLabel(b.source) ?? b.source}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-secondary whitespace-nowrap">
                      {formatPKR(b.share)}
                      {b.paid > 0 && (
                        <span className="block text-[11px] text-status-pending">
                          {formatPKR(b.paid)} paid
                        </span>
                      )}
                    </td>
                    <td className="px-4 md:px-5 py-3 text-right text-financial whitespace-nowrap">
                      {formatPKR(b.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
          <h2 className="text-sm font-medium text-ink-primary">Your payments</h2>
        </div>
        <PayoutHistory
          entries={entries}
          empty="You haven't recorded a payment yet."
          actions={(e) =>
            e.status === "received" ? null : (
              <>
                <Link
                  href={`/client/payouts?edit=${e.id}`}
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
                      className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                    />
                  </form>
                )}
              </>
            )
          }
        />
      </section>
    </div>
  );
}
