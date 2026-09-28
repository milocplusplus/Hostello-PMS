"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { DEAL_MODELS, OTA_MODELS } from "@/lib/payout";
import { readSettings, type PaymentAccount } from "@/lib/settings";
import { OWNER_NOTICE_GROUPS } from "@/lib/owner-notices";

/**
 * One action per section of /admin/settings. Each writes only its own columns,
 * so saving one section can never overwrite another with stale form values.
 * RLS lets only the admin update the row; `requireOwner` says so politely first.
 * Every change lands in the audit log through the `audit_app_settings` trigger.
 */

type Patch = Record<string, unknown>;

function fail(section: string, message: string): never {
  redirect(`/admin/settings?error=${encodeURIComponent(message)}#${section}`);
}

async function save(section: string, patch: Patch, notice = "Saved.") {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) fail(section, error.message);

  // Settings reach every portal: forms, messages, the login page.
  revalidatePath("/", "layout");
  redirect(`/admin/settings?notice=${encodeURIComponent(notice)}#${section}`);
}

const str = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;

function percent(section: string, f: FormData, k: string, label: string): number {
  const n = Number(str(f, k));
  if (!Number.isFinite(n) || n < 0 || n > 100) fail(section, `${label} must be between 0 and 100.`);
  return n;
}

function time(section: string, f: FormData, k: string, label: string): string {
  const v = str(f, k);
  if (!/^\d{2}:\d{2}$/.test(v)) fail(section, `${label} needs a time.`);
  return v;
}

export async function saveBusiness(f: FormData) {
  const name = str(f, "business_name");
  if (!name) fail("business", "The business needs a name.");
  await save("business", {
    business_name: name.slice(0, 80),
    business_phone: opt(f, "business_phone"),
    business_email: opt(f, "business_email"),
    business_address: opt(f, "business_address"),
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The channel inbox's address, and the account owners invite as co-host.
 * Setting the address is what takes the inbox out of "coming soon".
 */
export async function saveChannelInbox(f: FormData) {
  const address = opt(f, "channel_inbox_address")?.toLowerCase() ?? null;
  const cohost = opt(f, "channel_cohost_email")?.toLowerCase() ?? null;
  if (address && !EMAIL.test(address)) fail("channel-inbox", "The inbox address isn't an email address.");
  if (cohost && !EMAIL.test(cohost)) fail("channel-inbox", "The co-host email isn't an email address.");
  await save("channel-inbox", { channel_inbox_address: address, channel_cohost_email: cohost });
}

export async function saveDealDefaults(f: FormData) {
  const deal = str(f, "default_deal_model");
  const ota = str(f, "default_ota_model");
  if (!DEAL_MODELS.some((m) => m.value === deal)) fail("deals", "Pick a deal model.");
  if (!OTA_MODELS.some((m) => m.value === ota)) fail("deals", "Pick the OTA terms.");
  const fee = Number(str(f, "default_monthly_fee") || 0);
  if (!Number.isFinite(fee) || fee < 0) fail("deals", "The monthly fee can't be negative.");

  await save("deals", {
    default_deal_model: deal,
    default_monthly_fee: fee,
    default_share_percent: percent("deals", f, "default_share_percent", "Share %"),
    default_deduct_percent: percent("deals", f, "default_deduct_percent", "Deduction %"),
    default_ota_model: ota,
    default_ota_share_percent: percent("deals", f, "default_ota_share_percent", "OTA share %"),
  });
}

export async function saveBookingDefaults(f: FormData) {
  const start = time("bookings", f, "short_stay_start", "Short stay from");
  const end = time("bookings", f, "short_stay_end", "Short stay to");
  if (end <= start) fail("bookings", "A short stay has to end after it starts.");
  const status = str(f, "default_booking_status");
  if (status !== "confirmed" && status !== "tentative") fail("bookings", "Pick a starting status.");

  await save("bookings", {
    checkin_time: time("bookings", f, "checkin_time", "Check-in time"),
    checkout_time: time("bookings", f, "checkout_time", "Check-out time"),
    short_stay_start: start,
    short_stay_end: end,
    default_booking_status: status,
  });
}

export async function saveOpsRules(f: FormData) {
  await save("ops", {
    ops_can_edit_prices: f.get("ops_can_edit_prices") === "on",
    ops_can_cancel: f.get("ops_can_cancel") === "on",
    ops_can_block: f.get("ops_can_block") === "on",
  });
}

export async function addPaymentAccount(f: FormData) {
  const kind = str(f, "kind");
  const title = str(f, "title");
  const number = str(f, "number");
  if (!title || !number) fail("payments", "An account needs a title and a number.");

  let account: PaymentAccount;
  if (kind === "bank") {
    const bank = str(f, "bank");
    if (!bank) fail("payments", "Which bank?");
    account = { kind, bank, title, number, iban: str(f, "iban").toUpperCase().replace(/\s+/g, "") };
  } else if (kind === "jazzcash" || kind === "easypaisa") {
    account = { kind, title, number };
  } else {
    fail("payments", "Pick the kind of account.");
  }

  const supabase = await createClient();
  const current = (await readSettings(supabase)).paymentAccounts;
  await save("payments", { payment_accounts: [...current, account] }, "Account added.");
}

export async function removePaymentAccount(f: FormData) {
  const index = Number(f.get("index"));
  const supabase = await createClient();
  const current = (await readSettings(supabase)).paymentAccounts;
  if (!Number.isInteger(index) || index < 0 || index >= current.length) fail("payments", "That account is gone.");
  await save("payments", { payment_accounts: current.filter((_, i) => i !== index) }, "Account removed.");
}

export async function saveGuestTemplate(f: FormData) {
  const id = str(f, "id");
  if (id !== "arrival" && id !== "balance" && id !== "checkout") fail("messages", "Unknown message.");

  const supabase = await createClient();
  const templates = { ...(await readSettings(supabase)).guestTemplates };
  // "Reset" posts an empty body: the built-in wording comes back.
  const body = f.get("reset") ? "" : ((f.get("body") as string | null) ?? "").trim();
  if (body) templates[id] = body.slice(0, 2000);
  else delete templates[id];

  await save("messages", { guest_templates: templates }, body ? "Message saved." : "Back to the built-in wording.");
}

export async function saveOwnerNoticeDefaults(f: FormData) {
  await save("owner-notices", {
    owner_notices: Object.fromEntries(OWNER_NOTICE_GROUPS.map((g) => [g.key, f.get(g.key) === "on"])),
  });
}
