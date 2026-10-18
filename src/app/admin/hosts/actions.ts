"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { extendedTrialEnd, PAYMENT_METHODS, SUBSCRIPTION_STATUSES } from "@/lib/hosts";

/**
 * Everything the owner does to a host's plan. `subscriptions` and
 * `subscription_payments` take writes from the admin only (RLS), so these checks
 * are for readable messages, not the lock.
 */

function back(id: string, params: Record<string, string>): never {
  redirect(`/admin/hosts/${id}?${new URLSearchParams(params).toString()}`);
}

const text = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").trim();

export async function saveHostSubscription(formData: FormData) {
  await requireOwner();
  const id = text(formData, "client_id");
  const plan = text(formData, "plan_key");
  const status = text(formData, "status");
  const trialEnd = text(formData, "trial_ends_at");
  const periodEnd = text(formData, "current_period_end");

  if (!(SUBSCRIPTION_STATUSES as readonly string[]).includes(status)) back(id, { error: "Pick a status." });
  for (const d of [trialEnd, periodEnd]) {
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) back(id, { error: "Dates need to be real dates." });
  }

  const supabase = await createClient();
  const { data: planRow } = await supabase.from("plans").select("key").eq("key", plan).maybeSingle();
  if (!planRow) back(id, { error: "Pick a plan." });

  const { error } = await supabase
    .from("subscriptions")
    .update({
      plan_key: plan,
      status,
      trial_ends_at: trialEnd ? `${trialEnd}T23:59:59Z` : null,
      current_period_end: periodEnd ? `${periodEnd}T23:59:59Z` : null,
      comped: formData.get("comped") === "on",
      note: text(formData, "note") || null,
    })
    .eq("client_id", id);
  if (error) back(id, { error: error.message });

  revalidatePath("/admin/hosts");
  back(id, { notice: "Plan saved." });
}

/** Adds days from the later of today and the current end, and brings a lapsed host back to trial. */
export async function extendHostTrial(formData: FormData) {
  await requireOwner();
  const id = text(formData, "client_id");
  const days = Number(text(formData, "days"));
  if (![7, 14, 30].includes(days)) back(id, { error: "Pick 7, 14 or 30 days." });

  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at")
    .eq("client_id", id)
    .maybeSingle();
  if (!sub) back(id, { error: "That host has no plan." });

  const end = extendedTrialEnd(sub.trial_ends_at, days);
  const { error } = await supabase
    .from("subscriptions")
    .update({
      trial_ends_at: `${end}T23:59:59Z`,
      status: sub.status === "active" ? "active" : "trial",
    })
    .eq("client_id", id);
  if (error) back(id, { error: error.message });

  revalidatePath("/admin/hosts");
  back(id, { notice: `Trial runs to ${end}.` });
}

export async function recordHostPayment(formData: FormData) {
  await requireOwner();
  const id = text(formData, "client_id");
  const amount = Number(text(formData, "amount"));
  const method = text(formData, "method");
  const months = Number(text(formData, "months"));

  if (!Number.isFinite(amount) || amount < 0) back(id, { error: "Enter the amount received." });
  if (!PAYMENT_METHODS.some((m) => m.value === method)) back(id, { error: "Say how it was paid." });
  if (months !== 1 && months !== 12) back(id, { error: "Pick one month or twelve." });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_record_subscription_payment", {
    p_client_id: id,
    p_amount: amount,
    p_method: method,
    p_reference: text(formData, "reference") || null,
    p_months: months,
    p_note: text(formData, "note") || null,
  });
  if (error) back(id, { error: error.message });

  revalidatePath("/admin/hosts");
  back(id, { notice: `Payment recorded. Paid until ${String(data).slice(0, 10)}.` });
}
