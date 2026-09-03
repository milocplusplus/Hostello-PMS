import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listPayments, loadOwed, loadOwedByClient } from "@/lib/owed";
import { RecipientPicker } from "@/components/shared/RecipientPicker";
import { SendMoneyFlow } from "@/components/shared/SendMoneyFlow";
import { sendPayout } from "../actions";

/**
 * Hostello sending an owner their payout, one decision per screen.
 *
 * Step one is a route of its own (`?client=…`) so a recipient can be linked to
 * directly and the back button behaves; everything after it is client-side,
 * because the payment screenshot cannot survive a round-trip. Nothing here
 * settles a booking — `sendPayout` files a `pending` row and the owner is the
 * only one who can close it.
 */
export default async function AdminSendPayoutPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; edit?: string; error?: string }>;
}) {
  const { client: clientId, edit, error } = await searchParams;
  const supabase = await createClient();

  if (!clientId) {
    const balances = await loadOwedByClient(supabase, "to_client");
    return (
      <Shell back="/admin/settlements?tab=to-client" title="Send a payout" step="Who is it for?">
        <div className="card overflow-hidden">
          <RecipientPicker
            balances={balances}
            hrefBase="/admin/settlements/send"
            empty="No client is owed anything right now. Every payout is either settled or already awaiting confirmation."
          />
        </div>
      </Shell>
    );
  }

  const [balances, owed, entries] = await Promise.all([
    loadOwedByClient(supabase, "to_client"),
    loadOwed(supabase, clientId, "to_client", { excludePayoutId: edit ?? null }),
    edit ? listPayments(supabase, "to_client", clientId, { id: edit }) : Promise.resolve([]),
  ]);

  const recipient = balances.find((b) => b.clientId === clientId);
  const editing = entries.find((e) => e.status !== "received") ?? null;

  // A pending payout already claims part of the balance; what is left is what
  // may actually be sent, and it is the cap the keypad enforces.
  const claimable = Math.max(0, Math.round((owed.balance - owed.pending) * 100) / 100);

  return (
    <Shell
      back="/admin/settlements?tab=to-client"
      title={editing ? "Correct this payout" : "Send a payout"}
      step={recipient?.clientName ?? "Client"}
    >
      <SendMoneyFlow
        action={sendPayout}
        direction="to_client"
        recipientName={recipient?.clientName ?? "This client"}
        clientId={clientId}
        claimable={claimable}
        bookings={owed.bookings}
        backHref="/admin/settlements?tab=to-client"
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
        error={error}
      />
    </Shell>
  );
}

/** The phone-shaped column both send steps live in. */
function Shell({
  back,
  title,
  step,
  children,
}: {
  back: string;
  title: string;
  step: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[26rem] flex flex-col gap-4 animate-in">
      <div>
        <Link
          href={back}
          className="text-xs text-ink-secondary hover:text-ink-primary inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft size={13} /> Settlements
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{title}</h1>
        <p className="text-sm text-ink-secondary mt-1">{step}</p>
      </div>
      {children}
    </div>
  );
}
