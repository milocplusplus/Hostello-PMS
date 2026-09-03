import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPKR } from "./payout";
import { methodLabel } from "./owed";
import { formatDayMonth } from "./calendar";
import { sourceLabel } from "./block-sources";
import { formatShortStayWindow, type ShortStay } from "./short-stay";
import { deliverPush } from "./push";
import type { NotificationCategory } from "./notifications";

/**
 * Every notification in the app is written here and nowhere else.
 *
 * One row goes into `notifications`; a database trigger fans it out to the
 * people the `audience` names (all admins, the owning client's portal user, or
 * both) and never to whoever caused it. That is what keeps role and ownership
 * scoping in one place instead of at each call site — and what lets the pg_cron
 * job and a future mobile backend write notifications the same way.
 *
 * Notifications are best-effort: a failure here must never roll back or block
 * the booking/block/payment that triggered it. Errors are swallowed deliberately.
 */

type Audience = "admin" | "client" | "both";

type EmitArgs = {
  kind: string;
  category: NotificationCategory;
  audience: Audience;
  title: string;
  body?: string | null;
  clientId?: string | null;
  bookingId?: string | null;
  propertyId?: string | null;
  /**
   * Names the event, so a double-submitted form, a retried Server Action or a
   * second cron run collapses into the row that already exists instead of
   * stacking up. Leave it out only for events that genuinely can repeat.
   */
  eventKey?: string | null;
};

async function emit(supabase: SupabaseClient, args: EmitArgs): Promise<void> {
  try {
    // A client session has no INSERT rights on `notifications` — it still has to
    // be able to tell the admins what it just did. `emit_notification` is the
    // one authorised door and checks the caller owns the client it names.
    const { data: id } = await supabase.rpc("emit_notification", {
      p_kind: args.kind,
      p_category: args.category,
      p_audience: args.audience,
      p_title: args.title,
      p_body: args.body ?? null,
      p_client_id: args.clientId ?? null,
      p_booking_id: args.bookingId ?? null,
      p_property_id: args.propertyId ?? null,
      p_event_key: args.eventKey ?? null,
    });

    // Null means the event_key already existed: a duplicate, correctly dropped.
    if (id) await deliverPush(id as string);
  } catch {
    // Deliberately ignored — see above.
  }
}

function dateRange(from: string, to: string, shortStay?: ShortStay | null) {
  const start = formatDayMonth(from);
  // A short stay's check-out is the next morning on paper only — say the hours.
  if (shortStay) return `${start} · ${formatShortStayWindow(shortStay.start, shortStay.end)}`;
  return from === to ? start : `${start} → ${formatDayMonth(to)}`;
}

function unitLabel(unitNames: string[]) {
  return unitNames.filter(Boolean).join(", ") || "the property";
}

async function clientName(supabase: SupabaseClient, clientId: string): Promise<string | null> {
  const { data } = await supabase.from("clients_v").select("name").eq("id", clientId).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

// ── Bookings ────────────────────────────────────────────────────────────────

type BookingEvent = {
  kind: string;
  title: string;
  clientId: string;
  bookingId: string;
  unitNames: string[];
  checkIn: string;
  checkOut: string;
  source: string | null;
  /** Set when the booking is hours rather than nights. */
  shortStay?: ShortStay | null;
  /** Appended to the body — what an edit actually changed. */
  extra?: string | null;
  /** Overrides the default key when one booking can raise the event twice. */
  eventKey?: string;
};

/**
 * A booking event says the same thing to both sides, but not in the same words:
 * an admin is reading across every client's portfolio and needs whose it is in
 * front, an owner already knows. So it is two rows, one per audience, and each
 * side's feed and push banner carry their own wording. The title stays short
 * because an OS banner truncates it — the detail belongs in the body.
 */
async function emitBookingEvent(supabase: SupabaseClient, args: BookingEvent) {
  const details = [
    unitLabel(args.unitNames),
    dateRange(args.checkIn, args.checkOut, args.shortStay),
    sourceLabel(args.source) ?? "Other",
    args.extra,
  ]
    .filter(Boolean)
    .join(" · ");

  const who = await clientName(supabase, args.clientId);

  for (const audience of ["client", "admin"] as const) {
    await emit(supabase, {
      kind: args.kind,
      category: "booking",
      audience,
      title: args.title,
      body: audience === "admin" && who ? `${who} · ${details}` : details,
      clientId: args.clientId,
      bookingId: args.bookingId,
      // Existing keys keep their documented `<kind>:<audience>:<bookingId>`
      // shape; only an event that can fire twice for one booking overrides it.
      eventKey: args.eventKey
        ? `${args.eventKey}:${audience}`
        : `${args.kind}:${audience}:${args.bookingId}`,
    });
  }
}

export async function notifyBookingCreated(
  supabase: SupabaseClient,
  args: {
    clientId: string;
    bookingId: string;
    unitNames: string[];
    checkIn: string;
    checkOut: string;
    source: string | null;
    shortStay?: ShortStay | null;
    isTentative: boolean;
  }
) {
  await emitBookingEvent(supabase, {
    kind: "booking_created",
    title: args.isTentative ? "Tentative booking held" : "New booking",
    ...args,
  });
}

/**
 * A booking was changed after the fact. Unlike create and cancel, this can
 * happen repeatedly on one booking, so the key carries the save's timestamp:
 * a retried or double-submitted form collapses, a second genuine edit does not.
 */
export async function notifyBookingUpdated(
  supabase: SupabaseClient,
  args: {
    clientId: string;
    bookingId: string;
    unitNames: string[];
    checkIn: string;
    checkOut: string;
    source: string | null;
    shortStay?: ShortStay | null;
    /** "Dates and price" — what the edit touched. */
    changed: string;
    updatedAt: string;
  }
) {
  await emitBookingEvent(supabase, {
    kind: "booking_updated",
    title: "Booking updated",
    clientId: args.clientId,
    bookingId: args.bookingId,
    unitNames: args.unitNames,
    checkIn: args.checkIn,
    checkOut: args.checkOut,
    source: args.source,
    shortStay: args.shortStay,
    extra: `${args.changed} changed`,
    eventKey: `booking_updated:${args.bookingId}:${args.updatedAt}`,
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
    source: string | null;
    shortStay?: ShortStay | null;
  }
) {
  await emitBookingEvent(supabase, {
    kind: "booking_cancelled",
    title: "Booking cancelled",
    ...args,
  });
}

/**
 * A guest was marked arrived or departed on the day sheet.
 *
 * Two rows like the other booking events, for the same reason: an admin reads
 * across every client's portfolio and needs whose property it is in front, an
 * owner already knows. Dates and channel are left out — for this event the
 * useful facts are who and where, and an OS banner has room for little else.
 *
 * Only the *doing* is announced, never the undoing: un-ticking is a correction,
 * the same call a revoked payout makes about re-opening a booking.
 */
export async function notifyStayProgress(
  supabase: SupabaseClient,
  args: {
    clientId: string;
    bookingId: string;
    step: "in" | "out";
    guestName: string | null;
    unitNames: string[];
  }
) {
  const kind = args.step === "in" ? "guest_checked_in" : "guest_checked_out";
  const detail = `${args.guestName ?? "The guest"} · ${unitLabel(args.unitNames)}`;
  const who = await clientName(supabase, args.clientId);

  for (const audience of ["client", "admin"] as const) {
    await emit(supabase, {
      kind,
      category: "booking",
      audience,
      title: args.step === "in" ? "Guest checked in" : "Guest checked out",
      body: audience === "admin" && who ? `${who} · ${detail}` : detail,
      clientId: args.clientId,
      bookingId: args.bookingId,
      // One per booking per direction: un-ticking and re-ticking is a
      // correction being fixed, not a second arrival.
      eventKey: `${kind}:${audience}:${args.bookingId}`,
    });
  }
}

// ── Money ───────────────────────────────────────────────────────────────────

export async function notifyPaymentReceived(
  supabase: SupabaseClient,
  args: {
    clientId: string;
    bookingId: string;
    receiptId: string;
    kind: "guest_to_hostello" | "hostello_to_client";
    amount: number | null;
    guestName: string | null;
  }
) {
  const money = args.amount ? ` · ${formatPKR(args.amount)}` : "";
  const guest = args.guestName ? ` from ${args.guestName}` : "";
  await emit(supabase, {
    kind: "payment_received",
    category: "payment",
    audience: "both",
    title:
      args.kind === "guest_to_hostello"
        ? `Token payment recorded${guest}`
        : "Payout receipt attached",
    body:
      args.kind === "guest_to_hostello"
        ? `Proof of the advance is on the booking${money}.`
        : `Proof of the payout is on the booking${money}.`,
    clientId: args.clientId,
    bookingId: args.bookingId,
    // One per receipt: re-uploading a replacement is a new event, a retry is not.
    eventKey: `payment_received:${args.receiptId}`,
  });
}

/**
 * An owner says they have sent Hostello its share. Admin-only: the owner just
 * filed it, telling them about their own action is noise. Keyed on the entry,
 * so a resubmitted correction announces itself once more and a double-tap does
 * not.
 */
export async function notifyPayoutSubmitted(
  supabase: SupabaseClient,
  args: {
    clientId: string;
    payoutId: string;
    amount: number;
    method: string;
    attempt: number;
  }
) {
  const who = await clientName(supabase, args.clientId);
  await emit(supabase, {
    kind: "payout_submitted",
    category: "payment",
    audience: "admin",
    title: `${who ?? "A client"} recorded a payment`,
    body: `${formatPKR(args.amount)} · ${methodLabel(args.method)} · needs confirming.`,
    clientId: args.clientId,
    eventKey: `payout_submitted:${args.payoutId}:${args.attempt}`,
  });
}

/** Admin confirmed the money landed. The owner is the one who needs to know. */
export async function notifyPayoutConfirmed(
  supabase: SupabaseClient,
  args: { clientId: string; payoutId: string; amount: number; balance: number }
) {
  await emit(supabase, {
    kind: "payout_confirmed",
    category: "payment",
    audience: "client",
    title: "Payment confirmed",
    body: `${formatPKR(args.amount)} received. ${
      args.balance > 0 ? `${formatPKR(args.balance)} still owed.` : "Nothing owed to Hostello."
    }`,
    clientId: args.clientId,
    eventKey: `payout_confirmed:${args.payoutId}`,
  });
}

/** Admin says it never arrived. The balance does not move — that is the point. */
export async function notifyPayoutRejected(
  supabase: SupabaseClient,
  args: { clientId: string; payoutId: string; amount: number; reason: string | null }
) {
  await emit(supabase, {
    kind: "payout_rejected",
    category: "payment",
    audience: "client",
    title: "Payment not received",
    body: `${formatPKR(args.amount)} could not be confirmed${
      args.reason ? ` · ${args.reason}` : ""
    }. The amount owed is unchanged.`,
    clientId: args.clientId,
    // Rejecting the same entry twice is one decision; a resubmit gets a new key
    // from `notifyPayoutSubmitted`, so the conversation still moves.
    eventKey: `payout_rejected:${args.payoutId}`,
  });
}

/**
 * Hostello kept its share out of money it already held, so nothing was owed and
 * nothing was paid. The owner still sees the booking close.
 */
export async function notifyShareReceived(
  supabase: SupabaseClient,
  args: { clientId: string; bookingId: string; unitNames: string[]; share: number }
) {
  await emit(supabase, {
    kind: "share_received",
    category: "payment",
    audience: "client",
    title: `Hostello's share settled for ${unitLabel(args.unitNames)}`,
    body: `${formatPKR(args.share)} marked as received. Nothing owed on this booking.`,
    clientId: args.clientId,
    bookingId: args.bookingId,
    eventKey: `share_received:${args.bookingId}`,
  });
}

/**
 * The other direction: Hostello has sent the owner their payout and wants it
 * confirmed. Client-only — Hostello just filed it. Keyed on the entry and the
 * attempt, so a corrected resend announces itself again and a double-tap does
 * not.
 */
export async function notifyHostelloPayoutSent(
  supabase: SupabaseClient,
  args: {
    clientId: string;
    payoutId: string;
    amount: number;
    method: string;
    hasProof: boolean;
    attempt: number;
  }
) {
  await emit(supabase, {
    kind: "payout_sent",
    category: "payment",
    audience: "client",
    title: "Hostello sent you a payout",
    body: `${formatPKR(args.amount)} · ${methodLabel(args.method)}${
      args.hasProof ? " · proof attached" : ""
    }. Confirm it once it reaches you — nothing settles until you do.`,
    clientId: args.clientId,
    eventKey: `payout_sent:${args.payoutId}:${args.attempt}`,
  });
}

/** The owner says the payout landed. Hostello is the side waiting to hear. */
export async function notifyHostelloPayoutConfirmed(
  supabase: SupabaseClient,
  args: { clientId: string; payoutId: string; amount: number; balance: number }
) {
  const who = await clientName(supabase, args.clientId);
  await emit(supabase, {
    kind: "payout_receipt_confirmed",
    category: "payment",
    audience: "admin",
    title: `${who ?? "A client"} confirmed a payout`,
    body: `${formatPKR(args.amount)} received. ${
      args.balance > 0 ? `${formatPKR(args.balance)} still owed to them.` : "Nothing left owed to them."
    }`,
    clientId: args.clientId,
    eventKey: `payout_receipt_confirmed:${args.payoutId}`,
  });
}

/**
 * Hostello recorded a payout as received for a client with no portal login.
 * Admin-only by necessity — there is no owner account to tell — and worded so
 * the feed never claims the owner confirmed anything.
 */
export async function notifyHostelloPayoutRecorded(
  supabase: SupabaseClient,
  args: { clientId: string; payoutId: string; amount: number; balance: number }
) {
  const who = await clientName(supabase, args.clientId);
  await emit(supabase, {
    kind: "payout_receipt_recorded",
    category: "payment",
    audience: "admin",
    title: `Payout to ${who ?? "a client"} recorded as received`,
    body: `${formatPKR(args.amount)} settled on their behalf — they have no portal login to confirm it. ${
      args.balance > 0 ? `${formatPKR(args.balance)} still owed to them.` : "Nothing left owed to them."
    }`,
    clientId: args.clientId,
    eventKey: `payout_receipt_recorded:${args.payoutId}`,
  });
}

/** The owner says it never arrived. Nothing settles — that is the point. */
export async function notifyHostelloPayoutRejected(
  supabase: SupabaseClient,
  args: { clientId: string; payoutId: string; amount: number; reason: string | null }
) {
  const who = await clientName(supabase, args.clientId);
  await emit(supabase, {
    kind: "payout_receipt_rejected",
    category: "payment",
    audience: "admin",
    title: `${who ?? "A client"} has not received a payout`,
    body: `${formatPKR(args.amount)} could not be confirmed${
      args.reason ? ` · ${args.reason}` : ""
    }. Nothing has settled.`,
    clientId: args.clientId,
    // One decision per entry; a corrected resend gets a fresh key from
    // `notifyHostelloPayoutSent`, so the conversation still moves.
    eventKey: `payout_receipt_rejected:${args.payoutId}`,
  });
}

// ── Calendar ────────────────────────────────────────────────────────────────

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
  await emit(supabase, {
    kind: "dates_blocked",
    category: "calendar",
    audience: "both",
    title: `Dates blocked on ${args.propertyName}`,
    body: `${dateRange(args.startDate, args.endDate)}${args.reason ? ` · ${args.reason}` : ""}`,
    clientId: args.clientId,
    propertyId: args.propertyId,
    eventKey: `dates_blocked:${args.propertyId}:${args.startDate}:${args.endDate}`,
  });
}

export async function notifyDatesUnblocked(
  supabase: SupabaseClient,
  args: {
    clientId: string;
    propertyId: string;
    propertyName: string;
    startDate: string;
    endDate: string;
    blockId: string;
  }
) {
  await emit(supabase, {
    kind: "dates_unblocked",
    category: "calendar",
    audience: "both",
    title: `Dates reopened on ${args.propertyName}`,
    body: `${dateRange(args.startDate, args.endDate)} · Bookable again.`,
    clientId: args.clientId,
    propertyId: args.propertyId,
    eventKey: `dates_unblocked:${args.blockId}`,
  });
}

/**
 * A block was written over nights that already had a booking. The app stops
 * block-on-block overlaps but not this one, and it is the case that quietly
 * double-sells a unit — so it goes to the admins as critical.
 */
export async function notifyCalendarConflict(
  supabase: SupabaseClient,
  args: {
    clientId: string;
    propertyId: string;
    propertyName: string;
    bookingId: string;
    guestName: string | null;
    startDate: string;
    endDate: string;
  }
) {
  await emit(supabase, {
    kind: "calendar_conflict",
    category: "critical",
    audience: "admin",
    title: `Block clashes with a booking on ${args.propertyName}`,
    body: `${dateRange(args.startDate, args.endDate)} · ${
      args.guestName ?? "A guest"
    } is booked on those nights. One of the two has to give.`,
    clientId: args.clientId,
    propertyId: args.propertyId,
    bookingId: args.bookingId,
    eventKey: `calendar_conflict:${args.bookingId}:${args.startDate}:${args.endDate}`,
  });
}

// ── Portfolio and terms ─────────────────────────────────────────────────────

export async function notifyPropertyAdded(
  supabase: SupabaseClient,
  args: { clientId: string; propertyId: string; propertyName: string; location: string }
) {
  await emit(supabase, {
    kind: "property_added",
    category: "system",
    audience: "both",
    title: `${args.propertyName} added to the portfolio`,
    body: args.location,
    clientId: args.clientId,
    propertyId: args.propertyId,
    eventKey: `property_added:${args.propertyId}`,
  });
}

export async function notifyPropertyRemoved(
  supabase: SupabaseClient,
  args: { clientId: string; propertyId: string; propertyName: string }
) {
  await emit(supabase, {
    kind: "property_removed",
    category: "system",
    audience: "both",
    title: `${args.propertyName} removed from the portfolio`,
    body: "It no longer appears on the calendar or in new bookings.",
    clientId: args.clientId,
    // No propertyId: the row it pointed at is gone.
    eventKey: `property_removed:${args.propertyId}`,
  });
}

export async function notifyClientTermsUpdated(
  supabase: SupabaseClient,
  args: { clientId: string; summary: string; day: string }
) {
  await emit(supabase, {
    kind: "client_terms_updated",
    category: "system",
    audience: "client",
    title: "Your payout terms were updated",
    body: `${args.summary} · Bookings already recorded keep the terms they were saved with.`,
    clientId: args.clientId,
    // At most one a day, however many times the form is saved.
    eventKey: `client_terms_updated:${args.clientId}:${args.day}`,
  });
}
