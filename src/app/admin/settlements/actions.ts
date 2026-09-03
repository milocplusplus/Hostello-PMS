"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import {
  isPayoutMethod,
  loadOwed,
  methodNeedsReceipt,
  removePaymentReceipt,
  uploadPaymentReceipt,
} from "@/lib/owed";
import {
  notifyHostelloPayoutRecorded,
  notifyHostelloPayoutSent,
  notifyPayoutConfirmed,
  notifyPayoutRejected,
  notifyShareReceived,
} from "@/lib/notify";

/** Back to the tab the form was submitted from, error and focus intact. */
function back(
  tab: "to-hostello" | "to-client",
  options: { client?: string | null; error?: string } = {}
): never {
  const params = new URLSearchParams({ tab });
  if (options.client) params.set("client", options.client);
  if (options.error) params.set("error", options.error);
  redirect(`/admin/settlements?${params}`);
}

function revalidateMoney() {
  revalidatePath("/admin/settlements");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  revalidatePath("/client/settlements");
  // The owner's bell and their own money pages.
  revalidatePath("/client", "layout");
}

// ── Owner → Hostello: Hostello rules on what the owner says they sent ────────

/**
 * The money landed. `apply_client_payout` marks the entry received and spreads
 * it over the open bookings oldest first, in one transaction — a half-applied
 * payment would leave the balance lying about itself.
 */
export async function confirmPayout(formData: FormData) {
  // Money moves are the owner's alone. Ops has no button for these, which is
  // not the same as being unable to POST to them.
  await requireOwner();
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("client_payouts")
    .select("id, client_id, amount, status")
    .eq("id", id)
    .maybeSingle();

  if (!entry) back("to-hostello", { error: "That payment entry no longer exists." });
  if (entry.status === "received") back("to-hostello");

  const { error } = await supabase.rpc("apply_client_payout", { p_payout_id: id });
  if (error) back("to-hostello", { error: error.message });

  const owed = await loadOwed(supabase, entry.client_id, "to_hostello");
  await notifyPayoutConfirmed(supabase, {
    clientId: entry.client_id,
    payoutId: id,
    amount: Number(entry.amount),
    balance: owed.balance,
  });

  revalidateMoney();
  back("to-hostello");
}

/**
 * It never arrived. The balance does not move — the entry stays on the record
 * as rejected so the owner can see why and correct it.
 */
export async function rejectPayout(formData: FormData) {
  await requireOwner();
  const id = formData.get("id") as string;
  const reason = (formData.get("reason") as string)?.trim() || null;

  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("client_payouts")
    .select("id, client_id, amount, status")
    .eq("id", id)
    .maybeSingle();

  if (!entry) back("to-hostello", { error: "That payment entry no longer exists." });
  if (entry.status === "received") {
    back("to-hostello", { error: "Un-confirm this payment before marking it not received." });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("client_payouts")
    .update({
      status: "rejected",
      admin_note: reason,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) back("to-hostello", { error: error.message });

  await notifyPayoutRejected(supabase, {
    clientId: entry.client_id,
    payoutId: id,
    amount: Number(entry.amount),
    reason,
  });

  revalidateMoney();
  back("to-hostello");
}

/** Confirmed by mistake. Pulls the allocations back off the bookings they cleared. */
export async function unconfirmPayout(formData: FormData) {
  await requireOwner();
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_client_payout", { p_payout_id: id });
  if (error) back("to-hostello", { error: error.message });

  revalidateMoney();
  back("to-hostello");
}

/**
 * Hostello kept its share out of money it was already holding, so there is
 * nothing for the owner to send. Clears one booking without a payment against
 * it. This is the one settlement either side can close on its own, and only
 * because no money has to move for it.
 */
export async function markShareReceived(formData: FormData) {
  await requireOwner();
  const id = formData.get("id") as string;
  const received = formData.get("received") === "true";
  const client = (formData.get("client") as string) || null;

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings_v")
    .select("id, client_id, hostello_share, booking_properties(properties(name))")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("bookings")
    .update({
      share_received: received,
      share_received_date: received ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);

  if (error) back("to-hostello", { client, error: error.message });

  // Only the clearing is news. Un-ticking is a correction, not an event.
  if (received && booking) {
    await notifyShareReceived(supabase, {
      clientId: booking.client_id,
      bookingId: id,
      share: Number(booking.hostello_share ?? 0),
      unitNames:
        (booking.booking_properties as unknown as { properties: { name: string } | null }[])
          ?.map((bp) => bp.properties?.name ?? "")
          .filter(Boolean) ?? [],
    });
  }

  revalidateMoney();
  revalidatePath("/admin/bookings/[id]", "page");
  back("to-hostello", { client });
}

// ── Hostello → owner: Hostello files, the owner rules ────────────────────────

/**
 * Hostello records a payout it has sent an owner. It lands as `pending` and
 * settles nothing — only the owner confirming it does that, because they are
 * the side that either has the money or does not.
 *
 * The same action files a new payout and corrects a rejected one: a rejection
 * is something to fix, not a form to fill in again.
 */
export async function sendPayout(formData: FormData) {
  await requireOwner();

  const clientId = formData.get("client_id") as string;
  const payoutId = (formData.get("payout_id") as string) || null;
  const amount = Number(formData.get("amount"));
  const method = formData.get("method");
  const reference = (formData.get("reference") as string)?.trim() || null;
  const file = formData.get("receipt");
  const receipt = file instanceof File && file.size > 0 ? file : null;

  const fail: (error: string) => never = (error) =>
    back("to-client", { client: clientId, error });

  if (!clientId) fail("Choose the client this payout is for.");
  if (!isPayoutMethod(method)) fail("Choose how you paid.");
  if (!Number.isFinite(amount) || amount <= 0) fail("Enter the amount you paid.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The entry being corrected, if this is a resend. Reading it first is also
  // the check that it is still open and belongs to this client.
  const existing = payoutId
    ? (
        await supabase
          .from("hostello_payouts")
          .select("id, client_id, receipt_path, status")
          .eq("id", payoutId)
          .maybeSingle()
      ).data
    : null;

  if (payoutId && (!existing || existing.client_id !== clientId)) {
    fail("That payout is no longer open.");
  }
  if (existing && existing.status === "received") {
    fail("That payout has already been confirmed by the owner.");
  }

  // A pending payout already claims part of the balance; two entries for the
  // same money is the mistake worth catching here.
  const owed = await loadOwed(supabase, clientId, "to_client", { excludePayoutId: existing?.id });
  const claimable = Math.round((owed.balance - owed.pending) * 100) / 100;

  if (amount > claimable + 0.5) {
    fail(
      claimable <= 0
        ? "Nothing is owed to this client right now — every booking is either settled or already covered by a payout awaiting their confirmation."
        : `You can record up to Rs ${claimable.toLocaleString("en-PK", { maximumFractionDigits: 0 })} right now.`
    );
  }

  let receiptPath = existing?.receipt_path ?? null;

  if (receipt) {
    const uploaded = await uploadPaymentReceipt(supabase, {
      direction: "to_client",
      clientId,
      file: receipt,
    });
    if (uploaded.error) fail(uploaded.error);
    // Replace, don't accumulate: the old screenshot is no longer the evidence.
    if (receiptPath) await removePaymentReceipt(supabase, "to_client", receiptPath);
    receiptPath = uploaded.path ?? null;
  }

  if (methodNeedsReceipt(method) && !receiptPath) {
    fail("Attach the payment screenshot for an online transfer.");
  }
  // Cash carries no screenshot; a leftover one from an online attempt would lie.
  if (!methodNeedsReceipt(method) && receiptPath && receipt === null && existing?.receipt_path) {
    await removePaymentReceipt(supabase, "to_client", receiptPath);
    receiptPath = null;
  }

  const row = {
    client_id: clientId,
    amount,
    method,
    reference,
    receipt_path: receiptPath,
    status: "pending" as const,
    client_note: null,
    sent_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = existing
    ? await supabase.from("hostello_payouts").update(row).eq("id", existing.id).select("id").single()
    : await supabase.from("hostello_payouts").insert(row).select("id").single();

  if (error || !saved) {
    if (receipt && receiptPath) await removePaymentReceipt(supabase, "to_client", receiptPath);
    fail(error?.message ?? "That payout could not be saved.");
  }

  await notifyHostelloPayoutSent(supabase, {
    clientId,
    payoutId: saved.id,
    amount,
    method,
    hasProof: Boolean(receiptPath),
    // A resend is news again; a double-tapped Save is not.
    attempt: existing ? Date.now() : 0,
  });

  revalidateMoney();
  back("to-client", { client: clientId });
}

/** Filed by mistake. Only while the owner has not ruled on it. */
export async function withdrawSentPayout(formData: FormData) {
  await requireOwner();
  const id = formData.get("id") as string;
  const client = (formData.get("client") as string) || null;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("hostello_payouts")
    .select("id, receipt_path, status")
    .eq("id", id)
    .maybeSingle();

  if (!existing || existing.status === "received") {
    back("to-client", { client, error: "That payout can no longer be withdrawn." });
  }

  const { error } = await supabase.from("hostello_payouts").delete().eq("id", id);
  if (error) back("to-client", { client, error: error.message });

  await removePaymentReceipt(supabase, "to_client", existing.receipt_path);

  revalidateMoney();
  back("to-client", { client });
}

/**
 * The override: Hostello records a payout as received for a client who has no
 * portal login and therefore no way to confirm it themselves. Without this
 * their bookings could never settle.
 *
 * `admin_confirm_hostello_payout` refuses the moment that client *does* have a
 * login, so this cannot become a general way around the owner — and it stamps
 * `confirmed_offline`, so the record never claims they confirmed it.
 */
export async function confirmPayoutForClient(formData: FormData) {
  await requireOwner();
  const id = formData.get("id") as string;
  const client = (formData.get("client") as string) || null;

  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("hostello_payouts")
    .select("id, client_id, amount, status")
    .eq("id", id)
    .maybeSingle();

  if (!entry) back("to-client", { client, error: "That payout no longer exists." });
  if (entry.status === "received") back("to-client", { client });

  const { error } = await supabase.rpc("admin_confirm_hostello_payout", { p_payout_id: id });
  if (error) back("to-client", { client, error: error.message });

  const owed = await loadOwed(supabase, entry.client_id, "to_client");
  await notifyHostelloPayoutRecorded(supabase, {
    clientId: entry.client_id,
    payoutId: id,
    amount: Number(entry.amount),
    balance: owed.balance,
  });

  revalidateMoney();
  back("to-client", { client });
}

/**
 * The owner confirmed it, and it was wrong. Re-opens only the bookings the
 * remaining money no longer covers.
 */
export async function unconfirmSentPayout(formData: FormData) {
  await requireOwner();
  const id = formData.get("id") as string;
  const client = (formData.get("client") as string) || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_hostello_payout", { p_payout_id: id });
  if (error) back("to-client", { client, error: error.message });

  revalidateMoney();
  back("to-client", { client });
}
