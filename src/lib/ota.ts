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

import { addDaysISO } from "@/lib/calendar";

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
  /** Airbnb's listing number, or Booking.com's `hotel_id` (a building, not a unit). */
  listing_id?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  check_in?: string | null;
  /** Exclusive, like `bookings.check_out` — the morning the guest leaves. */
  check_out?: string | null;
  guests?: number | null;
  currency?: string | null;
  gross?: number | null;
  /** The channel's cut from the host's side. */
  channel_fee?: number | null;
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
 * Why this message cannot be acted on as it stands.
 *
 * Only what the card has no field for. A new reservation's unit, dates and
 * price are all on its approval form, required there, so a mail that did not
 * carry them (every Booking.com one) is typed up rather than refused — this
 * used to grey the button out over the very box it asked to be filled in.
 */
export function blockers(message: { kind: OtaMessageKind; booking_id: string | null }): string[] {
  const problems: string[] = [];

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

// ── Holding a mail up against the calendar ──────────────────────────────────

/** A unit a reservation could be on, with the ids the channels know it by. */
export type InboxUnit = {
  id: string;
  name: string;
  clientName: string | null;
  airbnb_listing_id: string | null;
  booking_hotel_id: string | null;
  booking_room_type: string | null;
};

/** A night range the channel's calendar imported and nobody has written up yet. */
export type ImportedHold = {
  id: string;
  property_id: string;
  start_date: string;
  /** Inclusive, like every `calendar_blocks.end_date`. */
  end_date: string;
  source: string | null;
};

export type CalendarCheck =
  /** The calendar shows exactly this stay. */
  | "agrees"
  /** The calendar shows a stay on this unit, but on other nights. */
  | "differs"
  /** The unit's channel calendar is connected and shows nothing yet. */
  | "missing"
  /** Nothing to compare with: no calendar connected for these units. */
  | "no_calendar";

export type InboxMatch = {
  /** The units the reviewer chooses from; one when the channel named it. */
  units: InboxUnit[];
  /** Which to pre-select. */
  unitId: string | null;
  /** The imported hold approving will take over, if it is on `unitId`. */
  hold: ImportedHold | null;
  check: CalendarCheck;
  /** Filled from the hold when the mail had no departure (Booking.com). */
  checkIn: string | null;
  checkOut: string | null;
  /** Units already occupied on these nights, so the picker can say so. */
  takenUnitIds: string[];
};

/**
 * Which unit a new-reservation mail is for, and whether the channel's own
 * calendar agrees.
 *
 * The mail and the iCal are two reports of one reservation, arriving a minute
 * apart. Airbnb's mail names its unit and both dates, so the only question is
 * whether a hold on that unit covers exactly those nights. Booking.com's names
 * a building and an arrival date; a new hold starting that day on one of the
 * building's units is the best evidence of which one, and its end is the
 * departure the mail left out. With no hold, the first free unit of the
 * building is suggested — the reviewer confirms or changes it, never us.
 */
export function matchReservation(input: {
  source: string | null;
  propertyId: string | null;
  parsed: ParsedReservation;
  allUnits: InboxUnit[];
  holds: ImportedHold[];
  /** Units whose calendar for this channel is connected. */
  unitsWithCalendar: Set<string>;
  /** Occupied nights per unit (inclusive ranges), bookings and blocks alike. */
  busy: { propertyId: string; start: string; end: string }[];
}): InboxMatch {
  const { source, propertyId, parsed, allUnits, holds, unitsWithCalendar, busy } = input;

  const candidates = propertyId
    ? allUnits.filter((u) => u.id === propertyId)
    : source === "booking_com" && parsed.listing_id
      ? allUnits.filter((u) => u.booking_hotel_id === parsed.listing_id)
      : [];
  // Nothing claims the listing: every unit, for the reviewer to link it once.
  const units = candidates.length > 0 ? candidates : allUnits;
  const ids = new Set(units.map((u) => u.id));

  const checkIn = parsed.check_in ?? null;
  let checkOut = parsed.check_out ?? null;
  const lastNight = checkOut ? addDaysISO(checkOut, -1) : null;

  const mine = holds.filter((h) => ids.has(h.property_id) && (!source || h.source === source));
  const exact = checkIn
    ? mine.find((h) => h.start_date === checkIn && (lastNight === null || h.end_date === lastNight))
    : undefined;
  const near =
    !exact && checkIn
      ? mine.find((h) => h.start_date <= (lastNight ?? checkIn) && h.end_date >= checkIn)
      : undefined;
  const hold = exact ?? near ?? null;

  if (exact && !checkOut) checkOut = addDaysISO(exact.end_date, 1);

  const to = checkOut ? addDaysISO(checkOut, -1) : checkIn;
  const takenUnitIds =
    checkIn && to
      ? [...ids].filter((id) =>
          busy.some(
            (b) =>
              b.propertyId === id &&
              b.start <= to &&
              b.end >= checkIn &&
              // The hold being written up is this stay, not a clash with it.
              !(hold && hold.property_id === id && b.start === hold.start_date && b.end === hold.end_date)
          )
        )
      : [];

  const unitId =
    hold?.property_id ??
    (candidates.length > 0
      ? (candidates.find((u) => !takenUnitIds.includes(u.id)) ?? candidates[0]).id
      : null);

  const check: CalendarCheck = exact
    ? "agrees"
    : near
      ? "differs"
      : candidates.some((u) => unitsWithCalendar.has(u.id))
        ? "missing"
        : "no_calendar";

  return { units, unitId, hold, check, checkIn, checkOut, takenUnitIds };
}

/** Where the reviewer reads what the mail left out: guest, price, departure. */
export function channelReservationUrl(
  source: string | null,
  parsed: ParsedReservation
): string | null {
  const code = parsed.reservation_code;
  if (!code) return null;
  if (source === "airbnb") return `https://www.airbnb.com/hosting/reservations/details/${code}`;
  if (source === "booking_com") {
    const hotel = parsed.listing_id ? `&hotel_id=${parsed.listing_id}` : "";
    return `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/booking.html?res_id=${code}${hotel}`;
  }
  return null;
}
