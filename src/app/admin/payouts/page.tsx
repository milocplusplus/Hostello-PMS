import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentProfile } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import { listClientPayouts, loadOwedByClient } from "@/lib/owed";
import { PayoutHistory } from "@/components/shared/PayoutHistory";
import { Avatar } from "@/components/shared/Avatar";
import { errorBanner, fieldInput } from "@/lib/form-styles";
import { confirmPayout, rejectPayout, unconfirmPayout } from "./actions";

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const profile = await currentProfile();
  if (profile?.role !== "admin") redirect("/login");

  const supabase = await createClient();
  const [balances, entries] = await Promise.all([
    loadOwedByClient(supabase),
    listClientPayouts(supabase, null),
  ]);

  const pending = entries.filter((e) => e.status === "pending");
  const reviewed = entries.filter((e) => e.status !== "pending");
  const owedTotal = balances.reduce((s, b) => s + b.balance, 0);
  const pendingTotal = pending.reduce((s, e) => s + e.amount, 0);
  const confirmedTotal = entries
    .filter((e) => e.status === "received")
    .reduce((s, e) => s + e.amount, 0);
  const owing = balances.filter((b) => b.balance > 0);

  return (
    <div className="flex flex-col gap-4 animate-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Owed to Hostello</h1>
        <p className="text-sm text-ink-secondary mt-1.5">
          Hostello&apos;s share on bookings nobody has confirmed receiving, and the payments
          clients say they have sent.
        </p>
      </div>

      {error && <p className={errorBanner}>{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="card p-4 md:p-6 border border-hostello-gold/30">
          <p className="text-ink-muted text-xs">Owed across all clients</p>
          <p className="text-lg md:text-2xl font-semibold mt-2 truncate text-financial">
            {formatPKR(owedTotal)}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            {owing.length === 0
              ? "Nothing outstanding"
              : `${owing.length} ${owing.length === 1 ? "client" : "clients"}`}
          </p>
        </div>
        <div className="card p-4 md:p-6">
          <p className="text-ink-muted text-xs flex items-center gap-1">
            <Clock size={12} /> Needs confirming
          </p>
          <p className="text-lg md:text-2xl font-semibold mt-2 truncate text-status-pending">
            {formatPKR(pendingTotal)}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            {pending.length === 0
              ? "Nothing waiting on you"
              : `${pending.length} ${pending.length === 1 ? "entry" : "entries"}`}
          </p>
        </div>
        <div className="card p-4 md:p-6 col-span-2 lg:col-span-1">
          <p className="text-ink-muted text-xs">Confirmed to date</p>
          <p className="text-lg md:text-2xl font-semibold mt-2 truncate text-ink-primary">
            {formatPKR(confirmedTotal)}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">Payments you marked received</p>
        </div>
      </div>

      <section className="card overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
          <h2 className="text-sm font-medium text-ink-primary">Waiting on you</h2>
          <p className="text-[11px] text-ink-muted mt-0.5">
            A payment counts for nothing until you confirm it. Confirming clears the client&apos;s
            oldest bookings first.
          </p>
        </div>

        {pending.length === 0 ? (
          <p className="text-xs text-ink-muted px-5 py-6">
            No payments waiting to be confirmed.
          </p>
        ) : (
          <PayoutHistory
            entries={pending}
            showClient
            actions={(e) => (
              // One form, two verbs: the reason belongs to the reject button but
              // has to sit in the same form to reach it.
              <form action={confirmPayout} className="flex flex-wrap items-center gap-2 w-full">
                <input type="hidden" name="id" value={e.id} />
                <button
                  type="submit"
                  className="btn btn-gold btn-sm"
                >
                  Mark received
                </button>
                <input
                  name="reason"
                  type="text"
                  maxLength={140}
                  placeholder="Why not? (optional)"
                  className={`${fieldInput} text-xs py-1.5 flex-1 min-w-[160px]`}
                />
                <button
                  type="submit"
                  formAction={rejectPayout}
                  className="text-xs text-ink-secondary border border-border-hairline rounded-md px-3 py-1.5 hover:border-status-booked hover:text-status-booked transition-colors"
                >
                  Not received
                </button>
              </form>
            )}
          />
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-border-hairline flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink-primary">Owed by client</h2>
          <span className="text-xs text-ink-muted">
            {owing.length} of {balances.length}
          </span>
        </div>

        {owing.length === 0 ? (
          <p className="text-xs text-ink-muted px-5 py-6">
            No client owes anything right now.
          </p>
        ) : (
          <ul className="divide-y divide-border-hairline">
            {owing.map((b) => (
              <li key={b.clientId}>
                <Link
                  href={`/admin/bookings?client=${b.clientId}&settle=awaiting`}
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
          <h2 className="text-sm font-medium text-ink-primary">Reviewed</h2>
        </div>
        <PayoutHistory
          entries={reviewed}
          showClient
          empty="Nothing reviewed yet."
          actions={(e) =>
            e.status === "received" ? (
              <form action={unconfirmPayout}>
                <input type="hidden" name="id" value={e.id} />
                <button
                  type="submit"
                  className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                >
                  Un-confirm
                </button>
              </form>
            ) : null
          }
        />
      </section>
    </div>
  );
}
