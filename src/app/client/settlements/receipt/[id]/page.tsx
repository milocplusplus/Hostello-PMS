import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { listPayments, loadAllocations } from "@/lib/owed";
import { PayoutReceipt } from "@/components/shared/PayoutReceipt";
import { Celebration } from "@/components/shared/Celebration";
import { businessContact, loadSettings } from "@/lib/settings";

/**
 * The owner's copy of one payment, either direction.
 *
 * Both lookups are scoped to their own client id, so an id in the URL can only
 * ever open a receipt that is theirs — RLS says the same thing, but the scope
 * here means a stray id 404s rather than returning an empty page.
 */
export default async function ClientReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ celebrate?: string }>;
}) {
  const { id } = await params;
  const { celebrate } = await searchParams;

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const supabase = await createClient();
  const [paid, received] = await Promise.all([
    listPayments(supabase, "to_hostello", clientRecord.id, { id }),
    listPayments(supabase, "to_client", clientRecord.id, { id }),
  ]);

  const entry = paid[0] ?? received[0];
  if (!entry) notFound();

  const cleared = await loadAllocations(supabase, entry.direction, entry.id);
  const outbound = entry.direction === "to_hostello";

  return (
    <div className="mx-auto w-full max-w-[26rem] flex flex-col gap-4 animate-in">
      {/* Only a confirm lands here with the flag, and only a confirmed entry
          is worth it. */}
      {celebrate && entry.status === "received" && <Celebration amount={entry.amount} />}
      <div>
        <Link
          href={`/client/settlements?tab=${outbound ? "to-hostello" : "to-client"}`}
          className="text-xs text-ink-secondary hover:text-ink-primary inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft size={13} /> Settlements
        </Link>
        <h1 className="text-2xl font-semibold mt-2">
          {entry.status === "pending" && outbound ? "Payment recorded" : "Receipt"}
        </h1>
      </div>

      <PayoutReceipt

        business={businessContact(await loadSettings())}
        id={entry.id}
        status={entry.status}
        confirmedOffline={entry.confirmedOffline}
        amount={entry.amount}
        method={entry.method}
        reference={entry.reference}
        note={entry.note}
        createdAt={entry.createdAt}
        reviewedAt={entry.reviewedAt}
        payer={outbound ? "You" : "Hostello"}
        payee={outbound ? "Hostello" : "You"}
        awaiting={outbound ? "Hostello" : "you"}
        cleared={cleared.map((c) => ({
          bookingId: c.bookingId,
          amount: c.amount,
          guestName: c.guestName,
        }))}
      />
    </div>
  );
}
