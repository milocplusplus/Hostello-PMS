import type { SupabaseClient } from "@supabase/supabase-js";
import { PASS_THROUGH_SOURCES } from "./payout";
import { receiptExtension, validateReceipt } from "./receipts";

/**
 * What one side still owes the other, and the payments that clear it.
 *
 * This is settlement, not revenue: every rupee here was already decided by
 * `payout.ts` when the booking was written and snapshotted onto the row. All
 * this module does is add up the amounts nobody has confirmed receiving yet,
 * and subtract what has been paid against them. Never re-derive a split here.
 *
 * A booking carries two independent settlements running in opposite
 * directions, and each is closed by whoever actually received the money:
 *
 *   to_hostello — `hostello_share`, closed by `share_received`. The owner
 *                 collected the guest's money and sends Hostello its cut; an
 *                 admin confirms it landed.
 *   to_client   — `client_payout`, closed by `settled`. Hostello collected and
 *                 sends the owner theirs; the *owner* confirms it landed.
 *
 * Both directions run through the same functions here — one settlement engine,
 * two column sets — so a rule fixed on one side cannot drift on the other.
 */

export type SettlementDirection = "to_hostello" | "to_client";

type DirectionSpec = {
  /** The payments table for this direction. */
  table: "client_payouts" | "hostello_payouts";
  allocations: "client_payout_allocations" | "hostello_payout_allocations";
  bucket: string;
  /** Whoever reviews a payment leaves their reason here. */
  noteColumn: "admin_note" | "client_note";
  /** The booking column holding what is owed. */
  amountColumn: "hostello_share" | "client_payout";
  /** The booking flag that closes it. */
  closedColumn: "share_received" | "settled";
  /** Columns only this direction's table carries. */
  extraColumns: string[];
};

export const SETTLEMENT: Record<SettlementDirection, DirectionSpec> = {
  to_hostello: {
    table: "client_payouts",
    allocations: "client_payout_allocations",
    bucket: "payout-receipts",
    noteColumn: "admin_note",
    amountColumn: "hostello_share",
    closedColumn: "share_received",
    extraColumns: [],
  },
  to_client: {
    table: "hostello_payouts",
    allocations: "hostello_payout_allocations",
    // Its own bucket: on `payout-receipts` an owner may write and delete inside
    // their own folder, which must not be true of Hostello's proof of payment.
    bucket: "hostello-payout-receipts",
    noteColumn: "client_note",
    amountColumn: "client_payout",
    closedColumn: "settled",
    // Set when Hostello recorded the money as received for a client who has no
    // portal login and so cannot confirm it themselves.
    extraColumns: ["confirmed_offline"],
  },
};

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

export type SettlementPayment = {
  id: string;
  direction: SettlementDirection;
  clientId: string;
  clientName: string | null;
  amount: number;
  method: PayoutMethod;
  reference: string | null;
  status: PayoutStatus;
  /** The reviewer's reason for rejecting. Whose words depends on direction. */
  note: string | null;
  /**
   * `received`, but recorded by Hostello rather than confirmed by the owner —
   * only possible for a client with no portal login. The history must not blur
   * the two claims, so it is carried here rather than folded into `status`.
   */
  confirmedOffline: boolean;
  createdAt: string;
  reviewedAt: string | null;
  receiptUrl: string | null;
  receiptIsPdf: boolean;
};

export type OwedSummary = {
  /** Still owed: unconfirmed amounts, less what has already been allocated. */
  balance: number;
  /** Filed but not yet confirmed by the other side. Does not reduce `balance`. */
  pending: number;
  bookings: OwedBooking[];
};

type BookingRow = {
  id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  source: string;
  hostello_share?: number | null;
  client_payout?: number | null;
  booking_properties: { properties: { name: string } | null }[] | null;
};

/**
 * The open bookings behind one client's balance. Confirmed only — a tentative
 * stay has no share to owe (`payout.ts` zeroes it), and a cancelled one never
 * happened.
 *
 * `to_client` additionally drops the pass-through sources. Hostello owes a
 * payout only on stays it sold and collected for; on an owner-sourced booking,
 * a walk-in or a referral the owner already holds the guest's money, so there
 * is nothing to send. `payout.ts` owns that list.
 */
export async function loadOwed(
  supabase: SupabaseClient,
  clientId: string,
  direction: SettlementDirection,
  /** The entry being edited, left out of `pending` so it doesn't block itself. */
  options: { excludePayoutId?: string | null } = {}
): Promise<OwedSummary> {
  const spec = SETTLEMENT[direction];

  const pendingQuery = supabase
    .from(spec.table)
    .select("amount")
    .eq("client_id", clientId)
    .eq("status", "pending");

  let bookingQuery = supabase
    .from("bookings_v")
    .select(
      `id, guest_name, check_in, check_out, source, ${spec.amountColumn}, booking_properties(properties(name))`
    )
    .eq("client_id", clientId)
    .eq("status", "confirmed")
    .eq(spec.closedColumn, false)
    .gt(spec.amountColumn, 0)
    .order("check_in");

  if (direction === "to_client") {
    bookingQuery = bookingQuery.not("source", "in", `(${PASS_THROUGH_SOURCES.join(",")})`);
  }

  const [{ data: bookings }, { data: allocations }, { data: pendingRows }] = await Promise.all([
    bookingQuery,
    supabase.from(spec.allocations).select("booking_id, amount").eq("client_id", clientId),
    options.excludePayoutId ? pendingQuery.neq("id", options.excludePayoutId) : pendingQuery,
  ]);

  const paidPerBooking = new Map<string, number>();
  for (const a of allocations ?? []) {
    paidPerBooking.set(a.booking_id, (paidPerBooking.get(a.booking_id) ?? 0) + Number(a.amount));
  }

  const rows = ((bookings ?? []) as unknown as BookingRow[]).map((b) => {
    const share = Number(b[spec.amountColumn] ?? 0);
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
  /**
   * Whether this owner has a portal login. Without one they can never confirm
   * a payout, so Hostello may record it as received on their behalf — the one
   * case where the receiving side is not the side that ticks it.
   */
  hasLogin: boolean;
};

/** The same balance, for every client at once. The admin's side of the ledger. */
export async function loadOwedByClient(
  supabase: SupabaseClient,
  direction: SettlementDirection
): Promise<ClientBalance[]> {
  const spec = SETTLEMENT[direction];

  let bookingQuery = supabase
    .from("bookings_v")
    .select(`id, client_id, ${spec.amountColumn}`)
    .eq("status", "confirmed")
    .eq(spec.closedColumn, false)
    .gt(spec.amountColumn, 0);

  if (direction === "to_client") {
    bookingQuery = bookingQuery.not("source", "in", `(${PASS_THROUGH_SOURCES.join(",")})`);
  }

  const [{ data: bookings }, { data: allocations }, { data: clients }] = await Promise.all([
    bookingQuery,
    supabase.from(spec.allocations).select("booking_id, amount"),
    supabase.from("clients").select("id, name, owner_user_id").order("name"),
  ]);

  const paidPerBooking = new Map<string, number>();
  for (const a of allocations ?? []) {
    paidPerBooking.set(a.booking_id, (paidPerBooking.get(a.booking_id) ?? 0) + Number(a.amount));
  }

  const totals = new Map<string, { balance: number; bookings: number }>();
  for (const b of (bookings ?? []) as unknown as (BookingRow & { client_id: string })[]) {
    const outstanding = Number(b[spec.amountColumn] ?? 0) - (paidPerBooking.get(b.id) ?? 0);
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
      hasLogin: Boolean(c.owner_user_id),
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
  admin_note?: string | null;
  client_note?: string | null;
  confirmed_offline?: boolean | null;
  created_at: string;
  reviewed_at: string | null;
  clients?: { name: string } | null;
};

/**
 * The payment entries themselves. `clientId` null is the admin's view of every
 * client at once. Screenshots are private: each one comes back as a signed URL
 * minted here, never a public path.
 */
export async function listPayments(
  supabase: SupabaseClient,
  direction: SettlementDirection,
  clientId: string | null,
  options: { status?: PayoutStatus; limit?: number; id?: string } = {}
): Promise<SettlementPayment[]> {
  const spec = SETTLEMENT[direction];

  const columns = [
    "id, client_id, amount, method, reference, receipt_path, status",
    spec.noteColumn,
    ...spec.extraColumns,
    "created_at, reviewed_at, clients(name)",
  ].join(", ");

  let query = supabase
    .from(spec.table)
    .select(columns)
    .order("created_at", { ascending: false });

  if (clientId) query = query.eq("client_id", clientId);
  if (options.id) query = query.eq("id", options.id);
  if (options.status) query = query.eq("status", options.status);
  if (options.limit) query = query.limit(options.limit);

  const { data } = await query;
  const rows = (data ?? []) as unknown as PayoutRow[];
  if (rows.length === 0) return [];

  const paths = rows.map((r) => r.receipt_path).filter((p): p is string => Boolean(p));
  const urls = new Map<string, string>();

  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(spec.bucket)
      .createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    direction,
    clientId: r.client_id,
    clientName: r.clients?.name ?? null,
    amount: Number(r.amount),
    method: r.method,
    reference: r.reference,
    status: r.status,
    note: r[spec.noteColumn] ?? null,
    confirmedOffline: Boolean(r.confirmed_offline),
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
    receiptUrl: r.receipt_path ? urls.get(r.receipt_path) ?? null : null,
    receiptIsPdf: Boolean(r.receipt_path?.endsWith(".pdf")),
  }));
}

/**
 * The screenshot for an online transfer. The path's first segment is the client
 * id — that is what the storage policies key on, in both buckets.
 */
export async function uploadPaymentReceipt(
  supabase: SupabaseClient,
  args: { direction: SettlementDirection; clientId: string; file: File }
): Promise<{ error: string | null; path?: string }> {
  const invalid = validateReceipt(args.file);
  if (invalid) return { error: invalid };

  const ext = receiptExtension(args.file.type);
  if (!ext) return { error: "Attach the screenshot as a PNG, JPG, WebP or PDF." };

  const path = `${args.clientId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(SETTLEMENT[args.direction].bucket)
    .upload(path, args.file, { contentType: args.file.type });

  if (error) return { error: error.message };
  return { error: null, path };
}

export async function removePaymentReceipt(
  supabase: SupabaseClient,
  direction: SettlementDirection,
  path: string | null
) {
  if (path) await supabase.storage.from(SETTLEMENT[direction].bucket).remove([path]);
}

/**
 * The bookings an amount would clear, oldest stay first.
 *
 * Display only, and named `preview` because of it. The allocation that counts
 * is the one `apply_client_payout` / `apply_hostello_payout` performs in SQL;
 * this walks the same list in the same order so the review screen can say what
 * is about to happen before anyone commits to it. It never writes, and nothing
 * downstream reads its output — if the two ever disagree, SQL is right.
 *
 * `bookings` must already be `loadOwed`'s list: filtered, and ordered by
 * check-in. This adds no rules of its own.
 */
export type PreviewLine = OwedBooking & { applied: number; closes: boolean };

export function previewAllocation(
  bookings: OwedBooking[],
  amount: number
): { lines: PreviewLine[]; unallocated: number } {
  let left = Math.round(amount * 100) / 100;
  const lines: PreviewLine[] = [];

  for (const booking of bookings) {
    if (left <= 0) break;
    const applied = Math.min(left, booking.outstanding);
    left = Math.round((left - applied) * 100) / 100;
    lines.push({ ...booking, applied, closes: applied >= booking.outstanding });
  }

  return { lines, unallocated: Math.max(0, left) };
}

export type Allocation = {
  bookingId: string;
  amount: number;
  guestName: string | null;
  checkIn: string;
  unitNames: string[];
};

/** What a confirmed payment actually cleared. The receipt's proof of work. */
export async function loadAllocations(
  supabase: SupabaseClient,
  direction: SettlementDirection,
  payoutId: string
): Promise<Allocation[]> {
  const { data } = await supabase
    .from(SETTLEMENT[direction].allocations)
    .select("booking_id, amount")
    .eq("payout_id", payoutId);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: bookings } = await supabase
    .from("bookings_v")
    .select("id, guest_name, check_in, booking_properties(properties(name))")
    .in(
      "id",
      rows.map((r) => r.booking_id)
    );

  const byId = new Map(
    ((bookings ?? []) as unknown as BookingRow[]).map((b) => [b.id, b] as const)
  );

  return rows
    .map((r) => {
      const booking = byId.get(r.booking_id);
      return {
        bookingId: r.booking_id,
        amount: Number(r.amount),
        guestName: booking?.guest_name ?? null,
        checkIn: booking?.check_in ?? "",
        unitNames: (booking?.booking_properties ?? [])
          .map((bp) => bp.properties?.name ?? "")
          .filter(Boolean),
      };
    })
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}
