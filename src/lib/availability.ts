import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, formatDayMonth, todayISO } from "./calendar";
import { checkChannelClash } from "./ical-sync";

/**
 * What makes a night unavailable, in one place.
 *
 * Two independent tables answer that question and they disagree about how a
 * range ends: a booking's `check_out` is exclusive (the guest leaves that
 * morning), a `calendar_blocks.end_date` is inclusive. Everything in here is
 * expressed in *occupied nights* — `start`..`end`, both inclusive — so that
 * conversion happens once, here, instead of at every call site.
 *
 * Both the write path (`findStayClash`, which refuses to double-sell a unit)
 * and the date picker (`listUnavailable`, which greys those nights out before
 * anyone tries) read from this file, so what the form shows and what the server
 * accepts can't drift apart.
 */
export type UnavailableRange = {
  propertyId: string;
  /** First occupied night. */
  start: string;
  /** Last occupied night, inclusive. */
  end: string;
  kind: "booking" | "block";
};

function rangeLabel(start: string, end: string) {
  return start === end ? formatDayMonth(start) : `${formatDayMonth(start)} → ${formatDayMonth(end)}`;
}

/**
 * Is this stay free to write? Returns the reason it isn't, or null.
 *
 * Checks both tables. `excludeBookingId` is what lets a booking be edited
 * without clashing with itself; `excludeBlockId` is what lets a channel's
 * imported hold be typed up as the booking it already is.
 */
export async function findStayClash(
  supabase: SupabaseClient,
  args: {
    propertyIds: string[];
    checkIn: string;
    /** Exclusive — the departure morning. */
    checkOut: string;
    excludeBookingId?: string;
    /** The imported hold this booking is being written from. */
    excludeBlockId?: string;
  }
): Promise<string | null> {
  const { propertyIds, checkIn, checkOut, excludeBookingId, excludeBlockId } = args;
  if (propertyIds.length === 0) return null;

  // A block covers start_date..end_date inclusive; this stay covers
  // check_in..check_out-1. They overlap when start_date < check_out and
  // end_date >= check_in — the one asymmetry that makes this easy to get wrong.
  const [links, blocks] = await Promise.all([
    supabase.from("booking_properties").select("booking_id").in("property_id", propertyIds),
    supabase
      .from("calendar_blocks")
      .select("id, booking_id, start_date, end_date")
      .in("property_id", propertyIds)
      .lt("start_date", checkOut)
      .gte("end_date", checkIn),
  ]);

  // The channel hold this stay already is: named directly while it is being
  // written up, and found by its own link on every edit after that. It is the
  // one block that cannot be what stands in the booking's way.
  const ownHold = (blocks.data ?? []).find(
    (b) => b.id === excludeBlockId || (excludeBookingId && b.booking_id === excludeBookingId)
  );

  const block = (blocks.data ?? []).find((b) => b.id !== ownHold?.id);
  if (block) {
    return `Those nights are blocked on one of the selected units (${rangeLabel(
      block.start_date,
      block.end_date
    )}). Reopen them on the calendar first, or pick other dates.`;
  }

  const bookingIds = [...new Set((links.data ?? []).map((r) => r.booking_id))].filter(
    (id) => id !== excludeBookingId
  );
  if (bookingIds.length === 0) return null;

  const { data: clashes } = await supabase
    .from("bookings_v")
    .select("check_in, check_out")
    .in("id", bookingIds)
    .neq("status", "cancelled")
    // A short stay holds its date only until the guest is ticked out; after
    // that the same day can be sold again. Overnight stays hold their nights
    // regardless.
    .or("is_short_stay.eq.false,checked_out_at.is.null")
    .lt("check_in", checkOut)
    .gt("check_out", checkIn)
    .limit(1);

  const clash = clashes?.[0];
  if (clash) {
    return `Those nights clash with an existing booking on one of the selected units (${rangeLabel(
      clash.check_in,
      addDaysISO(clash.check_out, -1)
    )}).`;
  }

  // Writing up — or later editing — a hold the channel itself sent us: the
  // channel has sold those nights, which is the reason this booking exists.
  // Asking it would only get the reservation quoted back as an objection to
  // itself, and the every-minute sync is what still catches a real overlap.
  if (ownHold) return null;

  // Nothing local objects, so ask the channels themselves. The scheduled sync
  // runs every minute; this covers the gap between two of them, for the
  // case where Airbnb sold the night a moment ago. It stays quiet when no
  // channel is connected and when one cannot be reached — see
  // `checkChannelClash`, which never fails a booking on a channel's behalf.
  return await checkChannelClash(supabase, { propertyIds, checkIn, checkOut });
}

/**
 * Every occupied night on these units from `from` onwards, for the date picker.
 * Past stays are left out — nobody is booking into last month.
 */
export async function listUnavailable(
  supabase: SupabaseClient,
  propertyIds: string[],
  options: { from?: string; excludeBookingId?: string; excludeBlockId?: string } = {}
): Promise<UnavailableRange[]> {
  if (propertyIds.length === 0) return [];

  const from = options.from ?? todayISO();

  const [links, blocks] = await Promise.all([
    supabase
      .from("booking_properties")
      .select(
        "property_id, booking_id, bookings!inner(check_in, check_out, status, is_short_stay, checked_out_at)"
      )
      .in("property_id", propertyIds)
      .neq("bookings.status", "cancelled")
      // check_out is exclusive, so the last night is check_out - 1: a stay is
      // still in the future only when check_out is strictly past `from`.
      .gt("bookings.check_out", from),
    supabase
      .from("calendar_blocks")
      .select("id, property_id, start_date, end_date, booking_id")
      .in("property_id", propertyIds)
      .gte("end_date", from),
  ]);

  const ranges: UnavailableRange[] = [];

  for (const link of links.data ?? []) {
    if (link.booking_id === options.excludeBookingId) continue;
    const booking = link.bookings as unknown as {
      check_in: string;
      check_out: string;
      is_short_stay: boolean;
      checked_out_at: string | null;
    } | null;
    if (!booking) continue;
    // A finished short stay leaves its date free for the rest of the day.
    if (booking.is_short_stay && booking.checked_out_at) continue;
    ranges.push({
      propertyId: link.property_id,
      start: booking.check_in,
      end: addDaysISO(booking.check_out, -1),
      kind: "booking",
    });
  }

  for (const block of blocks.data ?? []) {
    // The hold being written up — or already written up, on an edit — is not in
    // the way of the booking it became.
    if (block.id === options.excludeBlockId) continue;
    if (block.booking_id && block.booking_id === options.excludeBookingId) continue;
    ranges.push({
      propertyId: block.property_id,
      start: block.start_date,
      end: block.end_date,
      kind: "block",
    });
  }

  return ranges;
}
