import type { SupabaseClient } from "@supabase/supabase-js";
import { DEAL_MODELS, formatPKR } from "./payout";
import { blockTypeLabel, sourceLabel } from "./block-sources";
import { propertyTypeLabel } from "./property-types";

/**
 * The audit log, read side. Rows are written only by database triggers
 * (`audit_row`, `audit_auth_user`, `log_sign_in_failed` — see the
 * `audit_log` migration); this file turns them into sentences.
 */

export type AuditCategory = "booking" | "money" | "client" | "staff" | "signin";

export const AUDIT_CATEGORIES: { key: AuditCategory; label: string }[] = [
  { key: "booking", label: "Bookings & calendar" },
  { key: "money", label: "Money" },
  { key: "client", label: "Clients & properties" },
  { key: "staff", label: "Staff & logins" },
  { key: "signin", label: "Sign-ins" },
];

export function isAuditCategory(value: string | undefined): value is AuditCategory {
  return AUDIT_CATEGORIES.some((c) => c.key === value);
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type AuditEntry = {
  id: number;
  at: string;
  tx: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string;
  category: AuditCategory;
  action: string;
  table_name: string | null;
  record_id: string | null;
  label: string | null;
  client_id: string | null;
  property_id: string | null;
  booking_id: string | null;
  changes: Record<string, [Json, Json]> | null;
  snapshot: Record<string, Json> | null;
  cascaded: boolean;
};

const COLUMNS =
  "id, at, tx, actor_id, actor_name, actor_role, category, action, table_name, record_id, label, client_id, property_id, booking_id, changes, snapshot, cascaded";

export type AuditFilters = {
  /** A user id, or "system". */
  actor?: string;
  client?: string;
  property?: string;
  booking?: string;
  category?: AuditCategory;
  /** YYYY-MM-DD, Karachi days, both inclusive. */
  from?: string;
  to?: string;
  /** Keyset paging: entries older than this id. */
  before?: number;
  /** Leave out rows a bigger delete took with it; they are counted on it instead. */
  hideCascaded?: boolean;
};

export async function loadAudit(
  supabase: SupabaseClient,
  f: AuditFilters,
  limit = 60
): Promise<{ entries: AuditEntry[]; more: boolean; alsoRemoved: Map<number, string[]> }> {
  let q = supabase.from("audit_log").select(COLUMNS).order("id", { ascending: false }).limit(limit + 1);

  if (f.actor === "system") q = q.eq("actor_role", "system");
  else if (f.actor) q = q.eq("actor_id", f.actor);
  if (f.client) q = q.eq("client_id", f.client);
  if (f.property) q = q.eq("property_id", f.property);
  if (f.booking) q = q.eq("booking_id", f.booking);
  if (f.category) q = q.eq("category", f.category);
  if (f.from) q = q.gte("at", `${f.from}T00:00:00+05:00`);
  if (f.to) q = q.lte("at", `${f.to}T23:59:59.999+05:00`);
  if (f.before) q = q.lt("id", f.before);
  if (f.hideCascaded) q = q.eq("cascaded", false);

  const { data } = await q;
  const rows = (data ?? []) as AuditEntry[];
  const more = rows.length > limit;
  const entries = rows.slice(0, limit);

  // What each shown delete took with it: "3 units, 12 bookings".
  const alsoRemoved = new Map<number, string[]>();
  const deleteTxs = [...new Set(entries.filter((e) => e.action === "delete").map((e) => e.tx))];
  if (f.hideCascaded && deleteTxs.length > 0) {
    const { data: cascaded } = await supabase
      .from("audit_log")
      .select("tx, table_name")
      .in("tx", deleteTxs)
      .eq("cascaded", true);
    const counts = new Map<number, Map<string, number>>();
    for (const r of cascaded ?? []) {
      const byTable = counts.get(r.tx) ?? new Map<string, number>();
      byTable.set(r.table_name, (byTable.get(r.table_name) ?? 0) + 1);
      counts.set(r.tx, byTable);
    }
    for (const [tx, byTable] of counts) {
      alsoRemoved.set(
        tx,
        [...byTable].map(([t, n]) => `${n} ${n === 1 ? NOUN[t] ?? t : PLURAL[t] ?? `${NOUN[t] ?? t}s`}`)
      );
    }
  }

  return { entries, more, alsoRemoved };
}

// ── Words ───────────────────────────────────────────────────────────────────

const NOUN: Record<string, string> = {
  bookings: "booking",
  booking_properties: "unit on a booking",
  calendar_blocks: "calendar block",
  calendar_feeds: "channel link",
  calendar_exports: "calendar export link",
  client_payouts: "payment to Hostello",
  hostello_payouts: "payout to an owner",
  booking_receipts: "receipt",
  booking_guest_ids: "guest ID",
  clients: "client",
  properties: "unit",
  property_change_requests: "rate request",
  profiles: "profile",
};

const PLURAL: Record<string, string> = {
  booking_properties: "unit links",
  property_change_requests: "rate requests",
  client_payouts: "payments to Hostello",
  hostello_payouts: "payouts to owners",
};

export const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  ops: "Ops",
  client: "Owner",
  system: "System",
  unknown: "Unknown",
};

function after(e: AuditEntry, col: string): Json | undefined {
  return e.changes?.[col]?.[1];
}

/** "cancelled a booking", "confirmed a payment to Hostello", "signed in". */
export function auditSentence(e: AuditEntry): string {
  switch (e.action) {
    case "sign_in":
      return "signed in";
    case "sign_in_failed":
      return "failed to sign in (wrong password)";
    case "login_created":
      return "created a login";
    case "login_deleted":
      return "deleted a login";
    case "password_changed":
      return "changed a password";
    case "email_changed":
      return "changed a login email";
    case "access_removed":
      return "removed a login's access";
    case "access_restored":
      return "restored a login's access";
  }

  const table = e.table_name ?? "";
  const noun = NOUN[table] ?? table;

  if (e.action === "insert") {
    if (table === "booking_properties") return "added a unit to a booking";
    if (table === "booking_receipts" || table === "booking_guest_ids") return `uploaded a ${noun}`;
    if (table === "client_payouts" || table === "hostello_payouts") return `filed a ${noun}`;
    if (table === "calendar_blocks") return "blocked dates";
    return `added a ${noun}`;
  }

  if (e.action === "delete") {
    if (table === "booking_properties") return "removed a unit from a booking";
    if (table === "calendar_blocks") return "unblocked dates";
    return `deleted a ${noun}`;
  }

  // Updates: name the change when one field says what happened.
  const status = after(e, "status");
  if (table === "bookings") {
    if (status === "cancelled") return "cancelled a booking";
    if (e.changes?.checked_in_at && after(e, "checked_in_at")) return "checked a guest in";
    if (e.changes?.checked_out_at && after(e, "checked_out_at")) return "checked a guest out";
  }
  if (table === "client_payouts" || table === "hostello_payouts") {
    if (status === "received") return `confirmed a ${noun}`;
    if (status === "rejected") return `rejected a ${noun}`;
    if (status === "pending" && e.changes?.status) return `reopened a ${noun}`;
  }
  if (table === "property_change_requests") {
    if (status === "applied") return "approved a rate request";
    if (status === "declined") return "declined a rate request";
  }
  if (table === "profiles" && e.changes?.role) return "changed a role";
  return `edited a ${noun}`;
}

// ── Fields ──────────────────────────────────────────────────────────────────

type Kind = "money" | "percent" | "date" | "time" | "bool" | "text" | "enum";

const FIELDS: Record<string, [string, Kind]> = {
  guest_name: ["Guest", "text"],
  guest_phone: ["Phone", "text"],
  guests_count: ["Guests", "text"],
  check_in: ["Check-in", "date"],
  check_out: ["Check-out", "date"],
  is_short_stay: ["Short stay", "bool"],
  short_stay_start: ["Short stay from", "time"],
  short_stay_end: ["Short stay to", "time"],
  expected_arrival: ["Expected arrival", "time"],
  expected_departure: ["Expected departure", "time"],
  checked_in_at: ["Checked in", "time"],
  checked_out_at: ["Checked out", "time"],
  source: ["Channel", "enum"],
  status: ["Status", "enum"],
  sale_price: ["Sale price", "money"],
  nightly_price: ["Nightly price", "money"],
  advance_received: ["Advance", "money"],
  net_sale: ["Net sale", "money"],
  hostello_share: ["Hostello share", "money"],
  client_payout: ["Owner payout", "money"],
  settled: ["Owner paid", "bool"],
  settled_date: ["Owner paid on", "date"],
  share_received: ["Hostello share received", "bool"],
  share_received_date: ["Share received on", "date"],
  deal_model_snapshot: ["Deal model", "enum"],
  share_percent_snapshot: ["Share %", "percent"],
  deduct_percent_snapshot: ["Deduction %", "percent"],
  stack_rate_snapshot: ["Stack rate", "money"],
  ota_model_snapshot: ["OTA terms", "enum"],
  ota_share_percent_snapshot: ["OTA share %", "percent"],
  ota_ref: ["Channel reference", "text"],
  notes: ["Notes", "text"],
  name: ["Name", "text"],
  full_name: ["Name", "text"],
  role: ["Role", "enum"],
  contact_email: ["Email", "text"],
  contact_phone: ["Phone", "text"],
  deal_model: ["Deal model", "enum"],
  monthly_fee: ["Monthly fee", "money"],
  share_percent: ["Share %", "percent"],
  deduct_percent: ["Deduction %", "percent"],
  ota_model: ["OTA terms", "enum"],
  ota_share_percent: ["OTA share %", "percent"],
  location: ["Location", "text"],
  city: ["City", "text"],
  province: ["Province", "text"],
  type: ["Type", "enum"],
  stack_rate: ["Stack rate", "money"],
  short_stay_stack_rate: ["Short-stay stack rate", "money"],
  max_guests: ["Max guests", "text"],
  nightly_rate: ["Nightly rate", "money"],
  short_stay_rate: ["Short-stay rate", "money"],
  photo_path: ["Photo", "text"],
  start_date: ["From", "date"],
  end_date: ["To", "date"],
  block_type: ["Block type", "enum"],
  amount: ["Amount", "money"],
  method: ["Method", "enum"],
  reference: ["Reference", "text"],
  receipt_path: ["Proof", "text"],
  admin_note: ["Admin note", "text"],
  client_note: ["Owner note", "text"],
  note: ["Note", "text"],
  confirmed_offline: ["Confirmed offline", "bool"],
  kind: ["Kind", "enum"],
  storage_path: ["File", "text"],
  url: ["Link", "text"],
  label: ["Label", "text"],
  listing_ref: ["Listing", "text"],
  active: ["Active", "bool"],
  email: ["Email", "text"],
};

function enumLabel(col: string, v: string): string {
  if (col === "source") return sourceLabel(v) ?? v;
  if (col === "block_type") return blockTypeLabel(v);
  if (col === "type") return propertyTypeLabel(v) ?? v;
  if (col.startsWith("deal_model")) return DEAL_MODELS.find((d) => d.value === v)?.label ?? v;
  return v.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function fieldLabel(col: string): string | null {
  return FIELDS[col]?.[0] ?? null;
}

export function formatField(col: string, v: Json | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const kind = FIELDS[col]?.[1] ?? "text";
  switch (kind) {
    case "money":
      return formatPKR(Number(v));
    case "percent":
      return `${Number(v)}%`;
    case "bool":
      return v ? "Yes" : "No";
    case "date":
      return new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    case "time": {
      const s = String(v);
      // Bare clock times ("14:00:00") stay as they are.
      if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
      return new Date(s).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Karachi",
      });
    }
    case "enum":
      return enumLabel(col, String(v));
    default:
      return typeof v === "object" ? JSON.stringify(v) : String(v);
  }
}

/** Changed fields a person can read; ids and bookkeeping are left out. */
export function readableChanges(e: AuditEntry): { label: string; before: string; after: string }[] {
  return Object.entries(e.changes ?? {})
    .filter(([col]) => fieldLabel(col))
    .map(([col, [b, a]]) => ({
      label: fieldLabel(col) as string,
      before: formatField(col, b),
      after: formatField(col, a),
    }));
}

/** A created or deleted row, field by field. */
export function readableSnapshot(e: AuditEntry): { label: string; value: string }[] {
  return Object.entries(e.snapshot ?? {})
    .filter(([col, v]) => fieldLabel(col) && v !== null && v !== "")
    .map(([col, v]) => ({ label: fieldLabel(col) as string, value: formatField(col, v) }));
}

export function formatAuditTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  });
}
