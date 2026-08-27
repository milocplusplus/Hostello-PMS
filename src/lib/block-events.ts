import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyCalendarConflict, notifyDatesBlocked, notifyDatesUnblocked } from "./notify";

/**
 * What happens *after* a calendar block is written or removed — the same in both
 * portals, so it lives here rather than twice in two `actions.ts` files.
 *
 * `calendar_blocks.end_date` is inclusive and booking `check_out` is exclusive:
 * a booking and a block collide when `check_in <= end_date` and
 * `check_out > start_date`.
 */

type BlockShape = {
  property_id: string;
  start_date: string;
  end_date: string;
};

async function propertyContext(supabase: SupabaseClient, propertyId: string) {
  const { data } = await supabase
    .from("properties")
    .select("id, name, client_id")
    .eq("id", propertyId)
    .maybeSingle();
  return data;
}

/**
 * Announces a new block, and — because nothing in the app stops a block being
 * written over nights that are already sold — checks whether it just did that.
 * The app rejects block-on-block overlaps; this is the one that quietly
 * double-books a unit, so it goes to the admins as critical.
 */
export async function announceBlockCreated(
  supabase: SupabaseClient,
  args: BlockShape & { reason?: string | null }
) {
  const property = await propertyContext(supabase, args.property_id);
  if (!property) return;

  await notifyDatesBlocked(supabase, {
    clientId: property.client_id,
    propertyId: property.id,
    propertyName: property.name,
    startDate: args.start_date,
    endDate: args.end_date,
    reason: args.reason ?? null,
  });

  const { data: links } = await supabase
    .from("booking_properties")
    .select("booking_id")
    .eq("property_id", args.property_id);

  const bookingIds = [...new Set((links ?? []).map((l) => l.booking_id))];
  if (bookingIds.length === 0) return;

  const { data: clashes } = await supabase
    .from("bookings")
    .select("id, guest_name, check_in, check_out")
    .in("id", bookingIds)
    .neq("status", "cancelled")
    .lte("check_in", args.end_date)
    .gt("check_out", args.start_date);

  for (const clash of clashes ?? []) {
    await notifyCalendarConflict(supabase, {
      clientId: property.client_id,
      propertyId: property.id,
      propertyName: property.name,
      bookingId: clash.id,
      guestName: clash.guest_name,
      startDate: args.start_date,
      endDate: args.end_date,
    });
  }
}

export async function announceBlockRemoved(
  supabase: SupabaseClient,
  args: BlockShape & { id: string }
) {
  const property = await propertyContext(supabase, args.property_id);
  if (!property) return;

  await notifyDatesUnblocked(supabase, {
    clientId: property.client_id,
    propertyId: property.id,
    propertyName: property.name,
    startDate: args.start_date,
    endDate: args.end_date,
    blockId: args.id,
  });
}
