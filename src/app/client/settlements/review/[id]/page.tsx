import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { listPayments, loadAllocations, loadOwed } from "@/lib/owed";
import { IncomingPayout } from "@/components/shared/IncomingPayout";
import { PayoutReceipt } from "@/components/shared/PayoutReceipt";
import { confirmHostelloPayout, rejectHostelloPayout } from "../../actions";

/**
 * Hostello says it has sent this owner their payout. This is where the owner —
 * the only side that can — says whether the money reached them.
 *
 * Scoped to their own client id, so the id in the URL can only ever open their
 * own payout. One already ruled on renders as its receipt instead of a
 * decision.
 */
export default async function ClientReviewPayoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const supabase = await createClient();
  const [entry] = await listPayments(supabase, "to_client", clientRecord.id, { id });
  if (!entry) notFound();

  if (entry.status !== "pending") {
    const cleared = await loadAllocations(supabase, "to_client", entry.id);
    return (
      <Shell title="Payout reviewed">
        <PayoutReceipt
          id={entry.id}
          status={entry.status}
          confirmedOffline={entry.confirmedOffline}
          amount={entry.amount}
          method={entry.method}
          reference={entry.reference}
          note={entry.note}
          createdAt={entry.createdAt}
          reviewedAt={entry.reviewedAt}
          payer="Hostello"
          payee="You"
          awaiting="you"
          cleared={cleared.map((c) => ({
            bookingId: c.bookingId,
            amount: c.amount,
            guestName: c.guestName,
          }))}
        />
      </Shell>
    );
  }

  const owed = await loadOwed(supabase, clientRecord.id, "to_client");

  return (
    <Shell title="Did this reach you?">
      <IncomingPayout
        entry={entry}
        direction="to_client"
        from="Hostello"
        bookings={owed.bookings}
        confirmAction={confirmHostelloPayout}
        rejectAction={rejectHostelloPayout}
      />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[26rem] flex flex-col gap-4 animate-in">
      <div>
        <Link
          href="/client/settlements?tab=to-client"
          className="text-xs text-ink-secondary hover:text-ink-primary inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft size={13} /> Settlements
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{title}</h1>
      </div>
      {children}
    </div>
  );
}
