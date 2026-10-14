import type { SupabaseClient } from "@supabase/supabase-js";
import { calculatePayout, isCollector, type Collector, type DealModel, type OtaModel } from "./payout";
import { isPayoutMethod, type PayoutMethod, type PayoutStatus } from "./owed";
import { balancePaidOf } from "./booking-price";
import { bookingWriter } from "./payout-inputs";
import { todayISO } from "./calendar";

/**
 * What the guest pays after the advance, one entry per payment.
 *
 * A balance counts only once someone has recorded receiving it — that is the
 * whole point of this module. An admin's record counts at once; ops (cash at
 * the door) and the owner (a guest paid them) file a `pending` entry that
 * changes nothing until an admin confirms it. Every time a confirmed entry
 * appears or goes, `refreshDues` re-runs `calculatePayout` for the stay, so
 * settlement only ever sees money that is really in someone's hands.
 */

export type BalancePayment = {
  id: string;
  bookingId: string;
  amount: number;
  receivedBy: Collector;
  method: PayoutMethod;
  paidOn: string;
  note: string | null;
  status: PayoutStatus;
  reviewNote: string | null;
  recordedBy: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  booking_id: string;
  amount: number | string;
  received_by: Collector;
  method: PayoutMethod;
  paid_on: string;
  note: string | null;
  status: PayoutStatus;
  review_note: string | null;
  recorded_by: string | null;
  created_at: string;
};

const COLUMNS =
  "id, booking_id, amount, received_by, method, paid_on, note, status, review_note, recorded_by, created_at";

function toPayment(r: Row): BalancePayment {
  return {
    id: r.id,
    bookingId: r.booking_id,
    amount: Number(r.amount),
    receivedBy: r.received_by,
    method: r.method,
    paidOn: r.paid_on,
    note: r.note,
    status: r.status,
    reviewNote: r.review_note,
    recordedBy: r.recorded_by,
    createdAt: r.created_at,
  };
}

export async function listBalancePayments(
  supabase: SupabaseClient,
  bookingId: string
): Promise<BalancePayment[]> {
  const { data } = await supabase
    .from("booking_payments")
    .select(COLUMNS)
    .eq("booking_id", bookingId)
    .order("paid_on")
    .order("created_at");
  return ((data ?? []) as Row[]).map(toPayment);
}

export type PendingBalancePayment = BalancePayment & {
  guestName: string | null;
  clientName: string | null;
  checkIn: string;
};

/** Every entry waiting for the admin, oldest first, with the stay it belongs to. */
export async function listPendingBalancePayments(
  supabase: SupabaseClient
): Promise<PendingBalancePayment[]> {
  const { data } = await supabase
    .from("booking_payments")
    .select(COLUMNS)
    .eq("status", "pending")
    .order("created_at");
  const rows = ((data ?? []) as Row[]).map(toPayment);
  if (rows.length === 0) return [];

  const { data: bookings } = await supabase
    .from("bookings_v")
    .select("id, guest_name, check_in, clients:clients_v(name)")
    .in(
      "id",
      rows.map((r) => r.bookingId)
    );
  const byId = new Map(
    ((bookings ?? []) as unknown as {
      id: string;
      guest_name: string | null;
      check_in: string;
      clients: { name: string } | null;
    }[]).map((b) => [b.id, b] as const)
  );

  return rows.map((r) => {
    const b = byId.get(r.bookingId);
    return { ...r, guestName: b?.guest_name ?? null, clientName: b?.clients?.name ?? null, checkIn: b?.check_in ?? "" };
  });
}

type StayMoney = {
  client_id: string;
  guest_name: string | null;
  status: string;
  balance_due: number | string | null;
  balance_pending: number | string | null;
};

/** Reads what a form posted. The amount is checked against what is left to record. */
export function readBalancePayment(
  formData: FormData,
  stay: StayMoney
):
  | { ok: true; value: { amount: number; receivedBy: Collector; method: PayoutMethod; paidOn: string; note: string | null } }
  | { ok: false; error: string } {
  if (stay.status === "cancelled") return { ok: false, error: "This booking is cancelled." };

  const amount = Math.round(Number(formData.get("amount")) * 100) / 100;
  const receivedBy = formData.get("received_by");
  const method = formData.get("method");
  const paidOn = (formData.get("paid_on") as string) || todayISO();
  const note = (formData.get("note") as string)?.trim() || null;

  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter the amount the guest paid." };
  if (!isCollector(receivedBy)) return { ok: false, error: "Say who received the money." };
  if (!isPayoutMethod(method)) return { ok: false, error: "Say whether it was cash or online." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > todayISO()) {
    return { ok: false, error: "Pick the day it was paid — not a day still to come." };
  }

  const pending = Number(stay.balance_pending ?? 0);
  const left = Math.max(0, Number(stay.balance_due ?? 0) - pending);
  if (amount > left) {
    const waiting = pending > 0 ? ` (Rs ${pending.toLocaleString("en-PK")} more is waiting for approval)` : "";
    return {
      ok: false,
      error:
        left > 0
          ? `Only Rs ${left.toLocaleString("en-PK")} of the balance is left to record${waiting}.`
          : `Nothing is left to record on this stay${waiting}.`,
    };
  }

  return { ok: true, value: { amount, receivedBy, method, paidOn, note } };
}

/** The stay as the record form needs it: whose it is and what is left to pay. */
export async function loadStayMoney(supabase: SupabaseClient, bookingId: string): Promise<StayMoney | null> {
  const { data } = await supabase
    .from("bookings_v")
    .select("client_id, guest_name, status, balance_due, balance_pending")
    .eq("id", bookingId)
    .maybeSingle();
  return (data as StayMoney | null) ?? null;
}

/**
 * Re-runs the split for one stay on the money now received, and writes the
 * two settlement amounts. Admin only — the caller has established that; the
 * snapshots it reads are hidden from everyone else, and the write goes in with
 * the server's own credentials like every other booking write (`bookingWriter`).
 */
export async function refreshDues(supabase: SupabaseClient, bookingId: string): Promise<string | null> {
  const { data: b } = await supabase
    .from("bookings_v")
    .select(
      "sale_price, check_in, check_out, source, status, advance_received, advance_received_by, deal_model_snapshot, share_percent_snapshot, deduct_percent_snapshot, ota_model_snapshot, ota_share_percent_snapshot, stack_rate_snapshot, hostello_share_override, balance_paid_hostello, balance_paid_owner"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return "Booking not found.";

  const payout = calculatePayout({
    salePrice: Number(b.sale_price ?? 0),
    checkIn: b.check_in,
    checkOut: b.check_out,
    dealModel: b.deal_model_snapshot as DealModel,
    sharePercent: Number(b.share_percent_snapshot ?? 0),
    deductPercent: Number(b.deduct_percent_snapshot ?? 0),
    otaModel: (b.ota_model_snapshot ?? "none") as OtaModel,
    otaSharePercent: Number(b.ota_share_percent_snapshot ?? 0),
    stackRate: Number(b.stack_rate_snapshot ?? 0),
    source: b.source,
    status: b.status as "confirmed" | "tentative" | "cancelled",
    advanceReceived: Number(b.advance_received ?? 0),
    advanceReceivedBy: isCollector(b.advance_received_by) ? b.advance_received_by : "owner",
    balancePaid: balancePaidOf(b),
    hostelloShareOverride: b.hostello_share_override != null ? Number(b.hostello_share_override) : null,
  });

  const writer = await bookingWriter();
  if (!writer.ok) return writer.error;

  // Settled flags follow in SQL (`sync_settlement_flags`): a stay owed more
  // than was paid reopens, one already covered closes.
  const { error } = await writer.client
    .from("bookings")
    .update({ due_to_client: payout.dueToClient, due_to_hostello: payout.dueToHostello })
    .eq("id", bookingId);
  return error?.message ?? null;
}

export async function loadBalancePayment(
  supabase: SupabaseClient,
  id: string
): Promise<BalancePayment | null> {
  const { data } = await supabase.from("booking_payments").select(COLUMNS).eq("id", id).maybeSingle();
  return data ? toPayment(data as Row) : null;
}

/**
 * Where a payment form sends the person back to: the page it was posted from
 * (the booking, Today or Money), with any error pinned to the stay it is about.
 */
export function paymentReturn(formData: FormData, portal: "/admin" | "/client", error?: string): string {
  const back = formData.get("back");
  const bookingId = (formData.get("booking_id") as string | null) ?? "";
  const path =
    typeof back === "string" && back.startsWith(`${portal}/`) ? back : `${portal}/bookings/${bookingId}`;
  const url = new URL(path, "http://local");
  url.searchParams.delete("pay_error");
  url.searchParams.delete("pay_for");
  if (error) {
    url.searchParams.set("pay_error", error);
    if (bookingId) url.searchParams.set("pay_for", bookingId);
  }
  return url.pathname + url.search;
}
