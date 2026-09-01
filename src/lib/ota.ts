/**
 * The vocabulary of the channel inbox.
 *
 * A channel emails the host when something happens to a reservation; the
 * `ota-email` edge function stores that mail and has a go at reading it, and
 * what it managed to read lands here as an `OtaMessage` for an admin to accept
 * or throw away.
 *
 * Nothing in this file computes money. `parsed.gross` is what the channel said
 * the guest paid; Hostello's split comes from `payout.ts` when the reservation
 * is approved, exactly as it would for a booking typed in by hand.
 */

export type OtaMessageKind =
  | "new_booking"
  | "cancellation"
  | "alteration"
  | "payout"
  | "unknown";

export type OtaMessageStatus =
  | "pending"
  | "needs_property"
  | "applied"
  | "ignored"
  | "failed";

/** Whatever the parser found. Every field is optional because every field can be missing. */
export type ParsedReservation = {
  listing?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  check_in?: string | null;
  /** Exclusive, like `bookings.check_out` — the morning the guest leaves. */
  check_out?: string | null;
  guests?: number | null;
  currency?: string | null;
  gross?: number | null;
  host_payout?: number | null;
  reservation_code?: string | null;
};

export const KIND_LABEL: Record<OtaMessageKind, string> = {
  new_booking: "New reservation",
  cancellation: "Cancellation",
  alteration: "Date or price change",
  payout: "Payout notice",
  unknown: "Unrecognised",
};

export const STATUS_LABEL: Record<OtaMessageStatus, string> = {
  pending: "Needs review",
  needs_property: "No property mapped",
  applied: "Applied",
  ignored: "Dismissed",
  failed: "Could not be read",
};

/** Which of the calendar tokens the status chip borrows. */
export function statusTone(status: OtaMessageStatus): string {
  switch (status) {
    case "pending":
      return "var(--color-status-pending)";
    case "applied":
      return "var(--color-status-available)";
    case "needs_property":
    case "failed":
      return "var(--color-status-booked)";
    default:
      return "var(--color-ink-muted)";
  }
}

/** Statuses an admin still has to do something about. Drives the nav badge. */
export const OPEN_STATUSES: OtaMessageStatus[] = ["pending", "needs_property", "failed"];

/**
 * Why this message cannot be approved as it stands.
 *
 * Returned as a list rather than a boolean so the review card can say what is
 * wrong instead of just greying out the button. An admin can fix any of these
 * on the form; none of them is a dead end.
 */
export function blockers(
  message: { kind: OtaMessageKind; property_id: string | null; booking_id: string | null },
  parsed: ParsedReservation
): string[] {
  const problems: string[] = [];

  if (message.kind === "new_booking") {
    if (!message.property_id) problems.push("no property is mapped to this listing");
    if (!parsed.check_in || !parsed.check_out) problems.push("the dates could not be read");
    if (!parsed.gross) problems.push("no sale price was found — type one in");
  }

  if (message.kind === "cancellation" || message.kind === "alteration") {
    if (!message.booking_id) {
      problems.push("no booking here matches the channel's confirmation code");
    }
  }

  return problems;
}

/**
 * The channel quoted a currency that is not PKR.
 *
 * Worth shouting about: `payout.ts` is PKR throughout, so approving a USD
 * figure as a sale price would silently under-report the stay by a factor of
 * roughly 280.
 */
export function currencyWarning(parsed: ParsedReservation): string | null {
  const currency = parsed.currency;
  if (!currency || currency === "PKR") return null;
  return `The channel quoted this in ${currency}. Convert to PKR before approving — the payout math assumes PKR.`;
}
