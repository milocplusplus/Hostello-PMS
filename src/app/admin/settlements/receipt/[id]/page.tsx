import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listPayments, loadAllocations } from "@/lib/owed";
import { PayoutReceipt } from "@/components/shared/PayoutReceipt";

/**
 * One payment, as a receipt — where a send lands, and what either side comes
 * back to later.
 *
 * The direction is resolved by looking the id up in both tables rather than
 * carried in a query string: a receipt reachable only with the right `?dir=`
 * is a receipt that breaks the moment someone shares the link.
 */
export default async function AdminReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [sent, received] = await Promise.all([
    listPayments(supabase, "to_client", null, { id }),
    listPayments(supabase, "to_hostello", null, { id }),
  ]);

  const entry = sent[0] ?? received[0];
  if (!entry) notFound();

  const cleared = await loadAllocations(supabase, entry.direction, entry.id);
  const client = entry.clientName ?? "the owner";
  const outbound = entry.direction === "to_client";

  return (
    <div className="mx-auto w-full max-w-[26rem] flex flex-col gap-4 animate-in">
      <div>
        <Link
          href={`/admin/settlements?tab=${outbound ? "to-client" : "to-hostello"}`}
          className="text-xs text-ink-secondary hover:text-ink-primary inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft size={13} /> Settlements
        </Link>
        <h1 className="text-2xl font-semibold mt-2">
          {entry.status === "pending"
            ? outbound
              ? "Payout sent"
              : "Payment recorded"
            : "Receipt"}
        </h1>
      </div>

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
        payer={outbound ? "Hostello" : client}
        payee={outbound ? client : "Hostello"}
        awaiting={outbound ? client : "Hostello"}
        cleared={cleared.map((c) => ({
          bookingId: c.bookingId,
          amount: c.amount,
          guestName: c.guestName,
        }))}
      />
    </div>
  );
}
