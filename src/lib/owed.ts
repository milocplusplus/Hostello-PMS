import type { SupabaseClient } from "@supabase/supabase-js";
import { receiptExtension, validateReceipt } from "./receipts";

/**
 * What an owner owes Hostello, and the payments that clear it.
 *
 * This is settlement, not revenue: every rupee here was already decided by
 * `payout.ts` when the booking was written and snapshotted onto the row. All
 * this module does is add up the shares nobody has confirmed receiving yet, and
 * subtract what has been paid against them. Never re-derive a split in here.
 *
 * A booking carries two independent settlements: `share_received` (Hostello has
 * its cut) and `settled` (the owner has theirs). Only the first one is owed to
 * Hostello — the second runs the other way and is not this module's business.
 */

export const PAYOUT_RECEIPT_BUCKET = "payout-receipts";

export type PayoutMethod = "online" | "cash";
export type PayoutStatus = "pending" | "received" | "rejected";

export const PAYOUT_METHODS: { value: PayoutMethod; label: string; short: string }[] = [
  { value: "online", label: "Online transfer (bank or wallet)", short: "Online" },
  { value: "cash", label: "Cash, handed over", short: "Cash" },
];

export function methodLabel(method: string): string {
  return PAYOUT_METHODS.find((m) => m.value === method)?.short ?? method;
}

/** Only an online transfer has something to screenshot. */
export function methodNeedsReceipt(method: string): boolean {
  return method === "online";
}

export function isPayoutMethod(value: unknown): value is PayoutMethod {
  return PAYOUT_METHODS.some((m) => m.value === value);
}

export const PAYOUT_STATUS: Record<PayoutStatus, { label: string; tone: string }> = {
  pending: { label: "Awaiting confirmation", tone: "text-status-pending" },
  received: { label: "Received", tone: "text-financial" },
  rejected: { label: "Not received", tone: "text-status-booked" },
};

/** One booking's share of the balance. */
export type OwedBooking = {
  id: string;
  guestName: string | null;
  unitNames: string[];
  checkIn: string;
  checkOut: string;
  source: string;
  share: number;
  paid: number;
  outstanding: number;
};

export type ClientPayout = {
  id: string;
  clientId: string;
  clientName: string | null;
  amount: number;
  method: PayoutMethod;
  reference: string | null;
  status: PayoutStatus;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  receiptUrl: string | null;
  receiptIsPdf: boolean;
};

export type OwedSummary = {
  /** Still owed: unconfirmed shares, less what has already been allocated. */
  balance: number;
  /** Filed but not yet confirmed by an admin. Does not reduce `balance`. */
  pending: number;
  bookings: OwedBooking[];
};

type BookingRow = {
  id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  source: string;
  hostello_share: number | null;
  booking_properties: { properties: { name: string } | null }[] | null;
};

/**
 * The open bookings behind the balance. Confirmed only — a tentative stay has
 * no Hostello share to owe (`payout.ts` zeroes it), and a cancelled one never
 * happened.
 */
export async function loadOwed(
  supabase: SupabaseClient,
  clientId: string,
  /** The entry being edited, left out of `pending` so it doesn't block itself. */
  options: { excludePayoutId?: string | null } = {}
): Promise<OwedSummary> {
  const pendingQuery = supabase
    .from("client_payouts")
    .select("amount")
    .eq("client_id", clientId)
    .eq("status", "pending");

  const [{ data: bookings }, { data: allocations }, { data: pendingRows }] = await Promise.all([
    supabase
      .from("bookings_v")
      .select(
        "id, guest_name, check_in, check_out, source, hostello_share, booking_properties(properties(name))"
      )
      .eq("client_id", clientId)
      .eq("status", "confirmed")
      .eq("share_received", false)
      .gt("hostello_share", 0)
      .order("check_in"),
    supabase
      .from("client_payout_allocations")
      .select("booking_id, amount")
      .eq("client_id", clientId),
    options.excludePayoutId ? pendingQuery.neq("id", options.excludePayoutId) : pendingQuery,
  ]);

  const paidPerBooking = new Map<string, number>();
  for (const a of allocations ?? []) {
    paidPerBooking.set(a.booking_id, (paidPerBooking.get(a.booking_id) ?? 0) + Number(a.amount));
  }

  const rows = ((bookings ?? []) as unknown as BookingRow[]).map((b) => {
    const share = Number(b.hostello_share ?? 0);
    const paid = paidPerBooking.get(b.id) ?? 0;
    return {
      id: b.id,
      guestName: b.guest_name,
      unitNames: (b.booking_properties ?? [])
        .map((bp) => bp.properties?.name ?? "")
        .filter(Boolean),
      checkIn: b.check_in,
      checkOut: b.check_out,
      source: b.source,
      share,
      paid,
      outstanding: Math.max(0, Math.round((share - paid) * 100) / 100),
    };
  });

  return {
    balance: Math.round(rows.reduce((s, b) => s + b.outstanding, 0) * 100) / 100,
    pending: (pendingRows ?? []).reduce((s, p) => s + Number(p.amount), 0),
    bookings: rows.filter((b) => b.outstanding > 0),
  };
}

export type ClientBalance = {
  clientId: string;
  clientName: string;
  balance: number;
  bookings: number;
};

/** The same balance, for every client at once. The admin's side of the ledger. */
export async function loadOwedByClient(supabase: SupabaseClient): Promise<ClientBalance[]> {
  const [{ data: bookings }, { data: allocations }, { data: clients }] = await Promise.all([
    supabase
      .from("bookings_v")
      .select("id, client_id, hostello_share")
      .eq("status", "confirmed")
      .eq("share_received", false)
      .gt("hostello_share", 0),
    supabase.from("client_payout_allocations").select("booking_id, amount"),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const paidPerBooking = new Map<string, number>();
  for (const a of allocations ?? []) {
    paidPerBooking.set(a.booking_id, (paidPerBooking.get(a.booking_id) ?? 0) + Number(a.amount));
  }

  const totals = new Map<string, { balance: number; bookings: number }>();
  for (const b of bookings ?? []) {
    const outstanding = Number(b.hostello_share) - (paidPerBooking.get(b.id) ?? 0);
    if (outstanding <= 0) continue;
    const entry = totals.get(b.client_id) ?? { balance: 0, bookings: 0 };
    entry.balance += outstanding;
    entry.bookings += 1;
    totals.set(b.client_id, entry);
  }

  return (clients ?? [])
    .map((c) => ({
      clientId: c.id,
      clientName: c.name,
      balance: Math.round((totals.get(c.id)?.balance ?? 0) * 100) / 100,
      bookings: totals.get(c.id)?.bookings ?? 0,
    }))
    .sort((a, b) => b.balance - a.balance);
}

type PayoutRow = {
  id: string;
  client_id: string;
  amount: number;
  method: PayoutMethod;
  reference: string | null;
  receipt_path: string | null;
  status: PayoutStatus;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  clients?: { name: string } | null;
};

/**
 * The payment entries themselves. `clientId` null is the admin's view of every
 * client at once. Screenshots are private: each one comes back as a signed URL
 * minted here, never a public path.
 */
export async function listClientPayouts(
  supabase: SupabaseClient,
  clientId: string | null,
  options: { status?: PayoutStatus; limit?: number } = {}
): Promise<ClientPayout[]> {
  let query = supabase
    .from("client_payouts")
    .select(
      "id, client_id, amount, method, reference, receipt_path, status, admin_note, created_at, reviewed_at, clients(name)"
    )
    .order("created_at", { ascending: false });

  if (clientId) query = query.eq("client_id", clientId);
  if (options.status) query = query.eq("status", options.status);
  if (options.limit) query = query.limit(options.limit);

  const { data } = await query;
  const rows = (data ?? []) as unknown as PayoutRow[];
  if (rows.length === 0) return [];

  const paths = rows.map((r) => r.receipt_path).filter((p): p is string => Boolean(p));
  const urls = new Map<string, string>();

  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(PAYOUT_RECEIPT_BUCKET)
      .createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    clientName: r.clients?.name ?? null,
    amount: Number(r.amount),
    method: r.method,
    reference: r.reference,
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
    receiptUrl: r.receipt_path ? urls.get(r.receipt_path) ?? null : null,
    receiptIsPdf: Boolean(r.receipt_path?.endsWith(".pdf")),
  }));
}

/**
 * The screenshot for an online transfer. The path's first segment is the client
 * id — that is what the storage policies key on, so an owner can only ever
 * write into their own folder.
 */
export async function uploadPayoutReceipt(
  supabase: SupabaseClient,
  args: { clientId: string; file: File }
): Promise<{ error: string | null; path?: string }> {
  const invalid = validateReceipt(args.file);
  if (invalid) return { error: invalid };

  const ext = receiptExtension(args.file.type);
  if (!ext) return { error: "Attach the screenshot as a PNG, JPG, WebP or PDF." };

  const path = `${args.clientId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(PAYOUT_RECEIPT_BUCKET)
    .upload(path, args.file, { contentType: args.file.type });

  if (error) return { error: error.message };
  return { error: null, path };
}

export async function removePayoutReceipt(supabase: SupabaseClient, path: string | null) {
  if (path) await supabase.storage.from(PAYOUT_RECEIPT_BUCKET).remove([path]);
}
