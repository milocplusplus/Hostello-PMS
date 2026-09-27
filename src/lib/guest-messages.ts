import { formatDayMonth } from "./calendar";
import { formatPKR } from "./payout";
import { formatShortStayWindow, hhmm } from "./short-stay";

/**
 * The three messages a guest gets, every stay, typed from memory each time.
 *
 * This is not a messaging system and does not pretend to be one: it composes
 * text and hands it to WhatsApp through a `wa.me` link. Nothing is sent from
 * here, no delivery is observed, and no row is written — which is exactly why
 * every label says "Open in WhatsApp" and never "Send".
 *
 * The figures come in from the page that already rendered them, so a message
 * cannot quote a balance the Payment card above it disagrees with.
 */

/**
 * A phone number as `wa.me` needs it: digits only, country code included, no
 * `+`. The old inline `replace(/[^0-9]/g, "")` produced `03004412887` for a
 * locally-written Pakistani mobile — eleven digits WhatsApp cannot route,
 * because the trunk `0` has to become `92`.
 *
 * Returns null when there is nothing dialable, so the caller can say so rather
 * than render a link that opens WhatsApp on an empty chat.
 */
export function waPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;

  // 00 is the other way of writing +, so what follows is already international.
  if (digits.startsWith("00")) return digits.slice(2) || null;
  // A leading trunk 0 is national dialling: 0300… → 92300…
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  // Written without either prefix, as people often do: 300… → 92300…
  if (digits.length === 10 && digits.startsWith("3")) return `92${digits}`;
  return digits;
}

/** The link that opens WhatsApp with the message already typed. */
export function waLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/** Everything a message may mention. The page hands this over; nothing is re-read. */
export type GuestMessageContext = {
  guestName: string | null;
  unitNames: string[];
  checkIn: string;
  checkOut: string;
  /** Already `Math.max(0, sale_price - advance_received)` — the Payment card's figure. */
  balanceDue: number;
  expectedArrival: string | null;
  expectedDeparture: string | null;
  /** Set when the stay is sold by the hour, whose window replaces the dates. */
  shortStay: { start: string; end: string } | null;
  /** The business's own settings — see `houseStyle()`. */
  house: HouseStyle;
};

/** What /admin/settings contributes to every message. */
export type HouseStyle = {
  /** Saved wording per message; a missing one means the built-in text. */
  templates: Partial<Record<GuestMessageId, string>>;
  /** "14:00" — said when a booking has no expected time of its own. */
  checkinTime: string;
  checkoutTime: string;
  /** Hostello's accounts as text; empty when none are saved. */
  paymentDetails: string;
  businessName: string;
  businessPhone: string | null;
};

export type GuestMessageId = "arrival" | "balance" | "checkout";

export type GuestMessage = {
  id: GuestMessageId;
  label: string;
  /** What it is for, in the sender's words. */
  hint: string;
  body: (ctx: GuestMessageContext) => string;
};

/** "Ayesha" — a first name is what you open a message with, not a full record. */
function firstName(name: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

/** "Gulberg 2BHK and DHA Studio", or "your unit" when none is linked yet. */
function unitPhrase(names: string[]): string {
  if (names.length === 0) return "your unit";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The fill-ins a saved template may use. Settings lists them from here, so the
 * page and the substitution can never disagree about what exists.
 */
export const TEMPLATE_FIELDS: { key: string; about: string; value: (c: GuestMessageContext) => string }[] = [
  { key: "guest", about: "Guest's first name", value: (c) => firstName(c.guestName) },
  { key: "unit", about: "Unit name(s)", value: (c) => unitPhrase(c.unitNames) },
  { key: "checkin", about: "Check-in date", value: (c) => formatDayMonth(c.checkIn) },
  { key: "checkout", about: "Check-out date", value: (c) => formatDayMonth(c.checkOut) },
  {
    key: "arrival_time",
    about: "Expected arrival, else the standard check-in time",
    value: (c) => hhmm(c.shortStay?.start ?? c.expectedArrival ?? c.house.checkinTime),
  },
  {
    key: "departure_time",
    about: "Expected departure, else the standard check-out time",
    value: (c) => hhmm(c.shortStay?.end ?? c.expectedDeparture ?? c.house.checkoutTime),
  },
  { key: "balance", about: "Balance still to pay", value: (c) => formatPKR(c.balanceDue) },
  {
    key: "payment_details",
    about: "Hostello's payment accounts",
    value: (c) => c.house.paymentDetails || "(ask us for the account details)",
  },
  { key: "business", about: "Business name", value: (c) => c.house.businessName },
  { key: "phone", about: "Business phone", value: (c) => c.house.businessPhone ?? "" },
];

export function fillTemplate(template: string, c: GuestMessageContext): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const field = TEMPLATE_FIELDS.find((f) => f.key === key);
    return field ? field.value(c) : whole;
  });
}

/**
 * The built-in wording as templates — what Settings shows in an empty box and
 * what "Reset to default" goes back to. The functions below say the same
 * thing but also handle a short stay and a missing time, which a template
 * cannot; they run whenever no wording has been saved.
 */
export const DEFAULT_TEMPLATES: Record<GuestMessageId, string> = {
  arrival: [
    "Hello {guest} — your booking at {unit} is confirmed from {checkin} to {checkout}.",
    "",
    "Check-in is from {arrival_time}.",
    "I'll share the address and entry details before your arrival day. Any questions, just reply here.",
  ].join("\n"),
  balance: [
    "Hello {guest} — a quick reminder about your stay at {unit}.",
    "",
    "Balance still to pay: {balance}.",
    "",
    "You can settle it on arrival or transfer it beforehand:",
    "{payment_details}",
  ].join("\n"),
  checkout: [
    "Hello {guest} — hope the stay has been comfortable.",
    "",
    "Just a reminder that checkout is by {departure_time} on {checkout}. Please leave the keys inside and pull the door shut behind you.",
    "",
    "If you need a later checkout, ask and I'll see what's possible.",
  ].join("\n"),
};

/** A saved template when there is one, otherwise the built-in wording. */
function saved(id: GuestMessageId, builtIn: (c: GuestMessageContext) => string) {
  return (c: GuestMessageContext) => {
    const template = c.house.templates[id]?.trim();
    return template ? fillTemplate(template, c) : builtIn(c);
  };
}

export const GUEST_MESSAGES: GuestMessage[] = [
  {
    id: "arrival",
    label: "Arrival instructions",
    hint: "Where they are staying and when they can get in",
    body: saved("arrival", (c) => {
      const where = unitPhrase(c.unitNames);
      if (c.shortStay) {
        return [
          `Hello ${firstName(c.guestName)} — your booking at ${where} is confirmed for ${formatDayMonth(c.checkIn)}, ${formatShortStayWindow(c.shortStay.start, c.shortStay.end)}.`,
          "",
          "I'll share the address and entry details before you arrive. Any questions, just reply here.",
        ].join("\n");
      }
      return [
        `Hello ${firstName(c.guestName)} — your booking at ${where} is confirmed from ${formatDayMonth(c.checkIn)} to ${formatDayMonth(c.checkOut)}.`,
        "",
        // No expected time on the booking: the standard check-in time.
        `Check-in is from ${hhmm(c.expectedArrival ?? c.house.checkinTime)}.`,
        "I'll share the address and entry details before your arrival day. Any questions, just reply here.",
      ].join("\n");
    }),
  },
  {
    id: "balance",
    label: "Balance reminder",
    hint: "What is still to be paid on this stay",
    body: saved("balance", (c) =>
      [
        `Hello ${firstName(c.guestName)} — a quick reminder about your stay at ${unitPhrase(c.unitNames)}.`,
        "",
        `Balance still to pay: ${formatPKR(c.balanceDue)}.`,
        "",
        c.house.paymentDetails
          ? `You can settle it on arrival or transfer it beforehand:\n${c.house.paymentDetails}`
          : "You can settle it on arrival or transfer it beforehand — whichever is easier. Let me know if you'd like the account details.",
      ].join("\n")
    ),
  },
  {
    id: "checkout",
    label: "Checkout reminder",
    hint: "When they need to be out, and how to hand back the keys",
    body: saved("checkout", (c) => {
      const when = c.shortStay
        ? `by ${hhmm(c.shortStay.end)} today`
        : `by ${hhmm(c.expectedDeparture ?? c.house.checkoutTime)} on ${formatDayMonth(c.checkOut)}`;
      return [
        `Hello ${firstName(c.guestName)} — hope the stay has been comfortable.`,
        "",
        `Just a reminder that checkout is ${when}. Please leave the keys inside and pull the door shut behind you.`,
        "",
        "If you need a later checkout, ask and I'll see what's possible.",
      ].join("\n");
    }),
  },
];

/**
 * The messages worth offering for this stay. A balance reminder for a stay
 * with nothing outstanding is a message nobody would send, so it is not there
 * to be picked by mistake.
 */
export function messagesFor(ctx: GuestMessageContext): GuestMessage[] {
  return GUEST_MESSAGES.filter((m) => m.id !== "balance" || ctx.balanceDue > 0);
}
