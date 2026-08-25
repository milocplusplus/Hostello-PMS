import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPKR } from "./payout";

type NotifyKind =
  | "booking_created"
  | "booking_cancelled"
  | "dates_blocked"
  | "dates_unblocked"
  | "payout_settled";

/**
 * Notifications are best-effort: a failure here must never roll back or block
 * the booking/block that triggered it. Errors are swallowed deliberately.
 */
async function insert(
  supabase: SupabaseClient,
  row: {
    client_id: string;
    kind: NotifyKind;
    title: string;
    body?: string | null;
    booking_id?: string | null;
    property_id?: string | null;
  }
) {
  try {
    await supabase.from("notifications").insert(row);
  } catch {
    // Deliberately ignored — see above.
  }
}

function dateRange(from: string, to: string) {
  return from === to ? from : `${from} → ${to}`;
}

export async function notifyBookingCreated(
  supabase: SupabaseClient,
  args: {
    clientId: string;
    bookingId: string;
    unitNames: string[];
    checkIn: string;
    checkOut: string;
    clientPayout: number;
    isTentative: boolean;
    advanceReceived?: number;
  }
) {
  const units = args.unitNames.filter(Boolean).join(", ") || "your property";
  const parts = [
    dateRange(args.checkIn, args.checkOut),
    `Your payout: ${formatPKR(args.clientPayout)}`,
  ];
  // The token is what confirms the booking, so the client sees it landed.
  if (args.advanceReceived && args.advanceReceived > 0) {
    parts.push(`Token received: ${formatPKR(args.advanceReceived)}`);
  }
  await insert(supabase, {
    client_id: args.clientId,
    kind: "booking_created",
    title: args.isTentative
      ? `Tentative booking held for ${units}`
      : `New booking for ${units}`,
    body: parts.join(" · "),
    booking_id: args.bookingId,
  });
}

export async function notifyBookingCancelled(
  supabase: SupabaseClient,
  args: {
    clientId: string;
    bookingId: string;
    unitNames: string[];
    checkIn: string;
    checkOut: string;
  }
) {
  const units = args.unitNames.filter(Boolean).join(", ") || "your property";
  await insert(supabase, {
    client_id: args.clientId,
    kind: "booking_cancelled",
    title: `Booking cancelled for ${units}`,
    body: `${dateRange(args.checkIn, args.checkOut)} · These dates are available again.`,
    booking_id: args.bookingId,
  });
}

export async function notifyDatesBlocked(
  supabase: SupabaseClient,
  args: {
    clientId: string;
    propertyId: string;
    propertyName: string;
    startDate: string;
    endDate: string;
    reason?: string | null;
  }
) {
  await insert(supabase, {
    client_id: args.clientId,
    kind: "dates_blocked",
    title: `Dates blocked on ${args.propertyName}`,
    body: `${dateRange(args.startDate, args.endDate)}${args.reason ? ` · ${args.reason}` : ""}`,
    property_id: args.propertyId,
  });
}

export async function notifyPayoutSettled(
  supabase: SupabaseClient,
  args: {
    clientId: string;
    bookingId: string;
    unitNames: string[];
    clientPayout: number;
  }
) {
  const units = args.unitNames.filter(Boolean).join(", ") || "your property";
  await insert(supabase, {
    client_id: args.clientId,
    kind: "payout_settled",
    title: `Payout settled for ${units}`,
    body: `${formatPKR(args.clientPayout)} marked as paid out.`,
    booking_id: args.bookingId,
  });
}
