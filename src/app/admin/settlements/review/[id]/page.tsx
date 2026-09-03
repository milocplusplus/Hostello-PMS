import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listPayments, loadAllocations, loadOwed } from "@/lib/owed";
import { IncomingPayout } from "@/components/shared/IncomingPayout";
import { PayoutReceipt } from "@/components/shared/PayoutReceipt";
import { confirmPayout, rejectPayout } from "../../actions";

/**
 * An owner says they have paid Hostello its share. This is where an admin
 * decides whether it arrived.
 *
 * Only a `pending` entry is a decision; one already ruled on renders as its
 * receipt instead, so the link in a notification stays good after the fact
 * rather than dead-ending.
 */
export default async function AdminReviewPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [entry] = await listPayments(supabase, "to_hostello", null, { id });
  if (!entry) notFound();

  const from = entry.clientName ?? "This owner";

  if (entry.status !== "pending") {
    const cleared = await loadAllocations(supabase, "to_hostello", entry.id);
    return (
      <Shell title="Payment reviewed">
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
          payer={from}
          payee="Hostello"
          awaiting="Hostello"
          cleared={cleared.map((c) => ({
            bookingId: c.bookingId,
            amount: c.amount,
            guestName: c.guestName,
          }))}
        />
      </Shell>
    );
  }

  const owed = await loadOwed(supabase, entry.clientId, "to_hostello", {
    excludePayoutId: entry.id,
  });

  return (
    <Shell title="Payment received?">
      <IncomingPayout
        entry={entry}
        direction="to_hostello"
        from={from}
        bookings={owed.bookings}
        confirmAction={confirmPayout}
        rejectAction={rejectPayout}
      />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[26rem] flex flex-col gap-4 animate-in">
      <div>
        <Link
          href="/admin/settlements?tab=to-hostello"
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
