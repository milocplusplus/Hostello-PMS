import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { listPayments, loadOwed } from "@/lib/owed";
import { SendMoneyFlow } from "@/components/shared/SendMoneyFlow";
import { recordPayout } from "../actions";

/**
 * The owner recording money they have sent Hostello.
 *
 * The same flow as the admin side with the first step gone — there is only one
 * recipient to pick. It lands as `pending` and changes nothing about what they
 * owe until an admin confirms the money showed up.
 */
export default async function ClientSendPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; error?: string }>;
}) {
  const { edit, error } = await searchParams;

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const supabase = await createClient();
  const [owed, entries] = await Promise.all([
    loadOwed(supabase, clientRecord.id, "to_hostello", { excludePayoutId: edit ?? null }),
    edit ? listPayments(supabase, "to_hostello", clientRecord.id, { id: edit }) : Promise.resolve([]),
  ]);

  const editing = entries.find((e) => e.status !== "received") ?? null;
  const claimable = Math.max(0, Math.round((owed.balance - owed.pending) * 100) / 100);

  return (
    <div className="mx-auto w-full max-w-[26rem] flex flex-col gap-4 animate-in">
      <div>
        <Link
          href="/client/settlements?tab=to-hostello"
          className="text-xs text-ink-secondary hover:text-ink-primary inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft size={13} /> Settlements
        </Link>
        <h1 className="text-2xl font-semibold mt-2">
          {editing ? "Correct this payment" : "Pay Hostello"}
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          {editing ? "Fix what was wrong and send it back." : "Record what you have sent."}
        </p>
      </div>

      <SendMoneyFlow
        action={recordPayout}
        direction="to_hostello"
        recipientName="Hostello"
        claimable={claimable}
        bookings={owed.bookings}
        backHref="/client/settlements?tab=to-hostello"
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
    </div>
  );
}
