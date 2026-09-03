"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isPayoutMethod,
  loadOwed,
  methodNeedsReceipt,
  removePaymentReceipt,
  uploadPaymentReceipt,
} from "@/lib/owed";
import {
  notifyHostelloPayoutConfirmed,
  notifyHostelloPayoutRejected,
  notifyPayoutSubmitted,
} from "@/lib/notify";

function back(
  tab: "to-hostello" | "to-client",
  options: { error?: string } = {}
): never {
  const params = new URLSearchParams({ tab });
  if (options.error) params.set("error", options.error);
  redirect(`/client/settlements?${params}`);
}

function revalidateMoney() {
  revalidatePath("/client/settlements");
  revalidatePath("/client", "layout");
  revalidatePath("/admin/settlements");
  revalidatePath("/admin", "layout");
}

/** The signed-in owner's client row. Every action here is scoped by it. */
async function ownClient(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("clients")
    .select("id")
    .eq("owner_user_id", user?.id ?? "")
    .single();

  return { user, client: data };
}

// ── Owner → Hostello ─────────────────────────────────────────────────────────

/**
 * The owner records money they have sent Hostello. It lands as `pending` and
 * changes nothing about what they owe — only an admin confirming it does. The
 * same action files a new entry and resubmits a rejected one, because a
 * rejection is a correction to make, not a form to fill in again.
 */
export async function recordPayout(formData: FormData) {
  const payoutId = (formData.get("payout_id") as string) || null;
  const amount = Number(formData.get("amount"));
  const method = formData.get("method");
  const reference = (formData.get("reference") as string)?.trim() || null;
  const file = formData.get("receipt");
  const receipt = file instanceof File && file.size > 0 ? file : null;

  const fail: (error: string) => never = (error) => back("to-hostello", { error });

  if (!isPayoutMethod(method)) fail("Choose how you paid.");
  if (!Number.isFinite(amount) || amount <= 0) fail("Enter the amount you paid.");

  const supabase = await createClient();
  const { user, client } = await ownClient(supabase);

  if (!client) fail("Only a property owner can record a payment.");

  // The entry being corrected, if this is a resubmission. Reading it first is
  // also the check that it is theirs and still open.
  const existing = payoutId
    ? (
        await supabase
          .from("client_payouts")
          .select("id, client_id, receipt_path, status")
          .eq("id", payoutId)
          .maybeSingle()
      ).data
    : null;

  if (payoutId && (!existing || existing.client_id !== client.id)) {
    fail("That payment entry is no longer open.");
  }
  if (existing && existing.status === "received") {
    fail("That payment has already been confirmed.");
  }

  // A pending entry already claims part of the balance; two entries for the
  // same money is the mistake worth catching here.
  const owed = await loadOwed(supabase, client.id, "to_hostello", {
    excludePayoutId: existing?.id,
  });
  const claimable = Math.round((owed.balance - owed.pending) * 100) / 100;

  if (amount > claimable + 0.5) {
    fail(
      claimable <= 0
        ? "Nothing is owed right now — every booking is either settled or already covered by a payment awaiting confirmation."
        : `You can record up to Rs ${claimable.toLocaleString("en-PK", { maximumFractionDigits: 0 })} right now.`
    );
  }

  let receiptPath = existing?.receipt_path ?? null;

  if (receipt) {
    const uploaded = await uploadPaymentReceipt(supabase, {
      direction: "to_hostello",
      clientId: client.id,
      file: receipt,
    });
    if (uploaded.error) fail(uploaded.error);
    // Replace, don't accumulate: the old screenshot is no longer the evidence.
    if (receiptPath) await removePaymentReceipt(supabase, "to_hostello", receiptPath);
    receiptPath = uploaded.path ?? null;
  }

  if (methodNeedsReceipt(method) && !receiptPath) {
    fail("Attach the payment screenshot for an online transfer.");
  }
  // Cash carries no screenshot; a leftover one from an online attempt would lie.
  if (!methodNeedsReceipt(method) && receiptPath && receipt === null && existing?.receipt_path) {
    await removePaymentReceipt(supabase, "to_hostello", receiptPath);
    receiptPath = null;
  }

  const row = {
    client_id: client.id,
    amount,
    method,
    reference,
    receipt_path: receiptPath,
    status: "pending" as const,
    admin_note: null,
    submitted_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = existing
    ? await supabase.from("client_payouts").update(row).eq("id", existing.id).select("id").single()
    : await supabase.from("client_payouts").insert(row).select("id").single();

  if (error || !saved) {
    if (receipt && receiptPath) await removePaymentReceipt(supabase, "to_hostello", receiptPath);
    fail(error?.message ?? "That payment could not be saved.");
  }

  await notifyPayoutSubmitted(supabase, {
    clientId: client.id,
    payoutId: saved.id,
    amount,
    method,
    // A resubmission is news again; a double-tapped Save is not.
    attempt: existing ? Date.now() : 0,
  });

  revalidateMoney();
  back("to-hostello");
}

/** Filed by mistake. Only while nobody has ruled on it. */
export async function withdrawPayout(formData: FormData) {
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("client_payouts")
    .select("id, receipt_path, status")
    .eq("id", id)
    .maybeSingle();

  if (!existing || existing.status !== "pending") {
    back("to-hostello", { error: "That entry can no longer be withdrawn." });
  }

  // RLS is what actually decides this is theirs; the delete simply fails if not.
  const { error } = await supabase.from("client_payouts").delete().eq("id", id);
  if (error) back("to-hostello", { error: error.message });

  await removePaymentReceipt(supabase, "to_hostello", existing.receipt_path);

  revalidateMoney();
  back("to-hostello");
}

// ── Hostello → owner: the owner is the one who says it arrived ───────────────

/**
 * The payout landed. `apply_hostello_payout` marks it received and spreads it
 * over their open bookings oldest first, closing each as it is covered — in one
 * transaction, and only ever from this side. Hostello cannot settle a booking
 * on the owner's behalf.
 */
export async function confirmHostelloPayout(formData: FormData) {
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { client } = await ownClient(supabase);
  if (!client) back("to-client", { error: "Only a property owner can confirm a payout." });

  const { data: entry } = await supabase
    .from("hostello_payouts")
    .select("id, amount, status")
    .eq("id", id)
    .maybeSingle();

  if (!entry) back("to-client", { error: "That payout no longer exists." });
  if (entry.status === "received") back("to-client");

  const { error } = await supabase.rpc("apply_hostello_payout", { p_payout_id: id });
  if (error) back("to-client", { error: error.message });

  const owed = await loadOwed(supabase, client.id, "to_client");
  await notifyHostelloPayoutConfirmed(supabase, {
    clientId: client.id,
    payoutId: id,
    amount: Number(entry.amount),
    balance: owed.balance,
  });

  revalidateMoney();
  back("to-client");
}

/** It never arrived. Nothing settles — the entry goes back to Hostello with why. */
export async function rejectHostelloPayout(formData: FormData) {
  const id = formData.get("id") as string;
  const reason = (formData.get("reason") as string)?.trim() || null;

  const supabase = await createClient();
  const { client } = await ownClient(supabase);
  if (!client) back("to-client", { error: "Only a property owner can respond to a payout." });

  const { data: entry } = await supabase
    .from("hostello_payouts")
    .select("id, amount, status")
    .eq("id", id)
    .maybeSingle();

  if (!entry) back("to-client", { error: "That payout no longer exists." });
  if (entry.status === "received") {
    back("to-client", { error: "Un-confirm this payout before marking it not received." });
  }

  const { error } = await supabase.rpc("reject_hostello_payout", {
    p_payout_id: id,
    p_reason: reason,
  });
  if (error) back("to-client", { error: error.message });

  await notifyHostelloPayoutRejected(supabase, {
    clientId: client.id,
    payoutId: id,
    amount: Number(entry.amount),
    reason,
  });

  revalidateMoney();
  back("to-client");
}

/** Confirmed by mistake. Re-opens the bookings the money no longer covers. */
export async function unconfirmHostelloPayout(formData: FormData) {
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_hostello_payout", { p_payout_id: id });
  if (error) back("to-client", { error: error.message });

  revalidateMoney();
  back("to-client");
}
