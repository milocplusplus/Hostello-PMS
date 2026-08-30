"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isPayoutMethod,
  loadOwed,
  methodNeedsReceipt,
  removePayoutReceipt,
  uploadPayoutReceipt,
} from "@/lib/owed";
import { notifyPayoutSubmitted } from "@/lib/notify";

function back(error?: string): never {
  redirect(error ? `/client/payouts?error=${encodeURIComponent(error)}` : "/client/payouts");
}

/**
 * The owner records money they have sent Hostello. It lands as `pending` and
 * changes nothing about what they owe — only an admin confirming it does that.
 * The same action files a new entry and resubmits a rejected one, because a
 * rejection is a correction to make, not a form to fill in again.
 */
export async function recordPayout(formData: FormData) {
  const payoutId = (formData.get("payout_id") as string) || null;
  const amount = Number(formData.get("amount"));
  const method = formData.get("method");
  const reference = (formData.get("reference") as string)?.trim() || null;
  const file = formData.get("receipt");
  const receipt = file instanceof File && file.size > 0 ? file : null;

  if (!isPayoutMethod(method)) back("Choose how you paid.");
  if (!Number.isFinite(amount) || amount <= 0) back("Enter the amount you paid.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: ownClient } = await supabase
    .from("clients")
    .select("id")
    .eq("owner_user_id", user?.id ?? "")
    .single();

  if (!ownClient) back("Only a property owner can record a payment.");

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

  if (payoutId && (!existing || existing.client_id !== ownClient.id)) {
    back("That payment entry is no longer open.");
  }
  if (existing && existing.status === "received") {
    back("That payment has already been confirmed.");
  }

  // A pending entry already claims part of the balance; two entries for the
  // same money is the mistake worth catching here.
  const owed = await loadOwed(supabase, ownClient.id, { excludePayoutId: existing?.id });
  const claimable = Math.round((owed.balance - owed.pending) * 100) / 100;

  if (amount > claimable + 0.5) {
    back(
      claimable <= 0
        ? "Nothing is owed right now — every booking is either settled or already covered by a payment awaiting confirmation."
        : `You can record up to Rs ${claimable.toLocaleString("en-PK", { maximumFractionDigits: 0 })} right now.`
    );
  }

  let receiptPath = existing?.receipt_path ?? null;

  if (receipt) {
    const uploaded = await uploadPayoutReceipt(supabase, { clientId: ownClient.id, file: receipt });
    if (uploaded.error) back(uploaded.error);
    // Replace, don't accumulate: the old screenshot is no longer the evidence.
    if (receiptPath) await removePayoutReceipt(supabase, receiptPath);
    receiptPath = uploaded.path ?? null;
  }

  if (methodNeedsReceipt(method) && !receiptPath) {
    back("Attach the payment screenshot for an online transfer.");
  }
  // Cash carries no screenshot; a leftover one from an online attempt would lie.
  if (!methodNeedsReceipt(method) && receiptPath && receipt === null && existing?.receipt_path) {
    await removePayoutReceipt(supabase, receiptPath);
    receiptPath = null;
  }

  const row = {
    client_id: ownClient.id,
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
    if (receipt && receiptPath) await removePayoutReceipt(supabase, receiptPath);
    back(error?.message ?? "That payment could not be saved.");
  }

  await notifyPayoutSubmitted(supabase, {
    clientId: ownClient.id,
    payoutId: saved.id,
    amount,
    method,
    // A resubmission is news again; a double-tapped Save is not.
    attempt: existing ? Date.now() : 0,
  });

  revalidatePath("/client/payouts");
  revalidatePath("/admin/payouts");
  revalidatePath("/admin", "layout");
  back();
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

  if (!existing || existing.status !== "pending") back("That entry can no longer be withdrawn.");

  // RLS is what actually decides this is theirs; the delete simply fails if not.
  const { error } = await supabase.from("client_payouts").delete().eq("id", id);
  if (error) back(error.message);

  await removePayoutReceipt(supabase, existing.receipt_path);

  revalidatePath("/client/payouts");
  revalidatePath("/admin/payouts");
  back();
}
