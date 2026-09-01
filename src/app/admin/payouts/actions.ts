"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { loadOwed } from "@/lib/owed";
import { notifyPayoutConfirmed, notifyPayoutRejected, notifyShareReceived } from "@/lib/notify";

function back(error?: string): never {
  redirect(error ? `/admin/payouts?error=${encodeURIComponent(error)}` : "/admin/payouts");
}

function revalidateMoney() {
  revalidatePath("/admin/payouts");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/clients");
  revalidatePath("/client/payouts");
  // The owner's bell and their own money pages.
  revalidatePath("/client", "layout");
}

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

  if (!entry) back("That payment entry no longer exists.");
  if (entry.status === "received") back();

  const { error } = await supabase.rpc("apply_client_payout", { p_payout_id: id });
  if (error) back(error.message);

  const owed = await loadOwed(supabase, entry.client_id);
  await notifyPayoutConfirmed(supabase, {
    clientId: entry.client_id,
    payoutId: id,
    amount: Number(entry.amount),
    balance: owed.balance,
  });

  revalidateMoney();
  back();
}

/**
 * It never arrived. The balance does not move — the entry stays on the record
 * as rejected so the owner can see why and correct it.
 */
export async function rejectPayout(formData: FormData) {
  // Money moves are the owner's alone. Ops has no button for these, which is
  // not the same as being unable to POST to them.
  await requireOwner();
  const id = formData.get("id") as string;
  const reason = (formData.get("reason") as string)?.trim() || null;

  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("client_payouts")
    .select("id, client_id, amount, status")
    .eq("id", id)
    .maybeSingle();

  if (!entry) back("That payment entry no longer exists.");
  if (entry.status === "received") {
    back("Un-confirm this payment before marking it not received.");
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

  if (error) back(error.message);

  await notifyPayoutRejected(supabase, {
    clientId: entry.client_id,
    payoutId: id,
    amount: Number(entry.amount),
    reason,
  });

  revalidateMoney();
  back();
}

/** Confirmed by mistake. Pulls the allocations back off the bookings they cleared. */
export async function unconfirmPayout(formData: FormData) {
  // Money moves are the owner's alone. Ops has no button for these, which is
  // not the same as being unable to POST to them.
  await requireOwner();
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_client_payout", { p_payout_id: id });
  if (error) back(error.message);

  revalidateMoney();
  back();
}

/**
 * Hostello kept its share out of money it was already holding, so there is
 * nothing for the owner to send. Clears one booking without a payment against it.
 */
export async function markShareReceived(formData: FormData) {
  // Money moves are the owner's alone. Ops has no button for these, which is
  // not the same as being unable to POST to them.
  await requireOwner();
  const id = formData.get("id") as string;
  const received = formData.get("received") === "true";
  const from = (formData.get("from") as string) || null;

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

  if (error) return;

  // Only the clearing is news. Un-ticking is a correction, like un-settling.
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
  revalidatePath("/admin");
  if (from) redirect(from);
}
