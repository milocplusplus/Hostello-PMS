import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO } from "@/lib/calendar";

/**
 * Review requests: Airbnb stays whose guest is leaving or has just left. The
 * rows are written by `raise_review_requests()` in SQL (hourly); the app reads
 * them and sets the three ticks.
 */
export type ReviewRequest = {
  id: string;
  propertyId: string;
  unitName: string;
  /** Null for a stay known only from the Airbnb calendar link. */
  guestName: string | null;
  guestPhone: string | null;
  checkIn: string | null;
  leavesOn: string;
  asked: boolean;
  guestReviewed: boolean;
};

/** An unasked stay stays on the list this long; Airbnb's own window is 14. */
const ASK_FOR_DAYS = 7;
const REVIEW_WINDOW_DAYS = 14;

/**
 * What Today shows: stays still to ask (a week from departure) and stays asked
 * and waiting on the guest's review (Airbnb's fourteen days).
 */
export async function loadReviewRequests(
  supabase: SupabaseClient,
  today: string
): Promise<{ toAsk: ReviewRequest[]; waiting: ReviewRequest[] }> {
  const { data } = await supabase
    .from("review_requests")
    .select(
      "id, property_id, check_in, leaves_on, asked_at, guest_reviewed_at, properties:properties_v(name), bookings:bookings_v(guest_name, guest_phone, status)"
    )
    .is("review_received_at", null)
    .lte("leaves_on", today)
    .gte("leaves_on", addDaysISO(today, -REVIEW_WINDOW_DAYS))
    .order("leaves_on", { ascending: false });

  const rows = ((data ?? []) as unknown as {
    id: string;
    property_id: string;
    check_in: string | null;
    leaves_on: string;
    asked_at: string | null;
    guest_reviewed_at: string | null;
    properties: { name: string } | null;
    bookings: { guest_name: string | null; guest_phone: string | null; status: string } | null;
  }[])
    // A stay cancelled after its request was raised has nobody to ask.
    .filter((r) => !r.bookings || r.bookings.status === "confirmed")
    .map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      unitName: r.properties?.name ?? "Unit",
      guestName: r.bookings?.guest_name ?? null,
      guestPhone: r.bookings?.guest_phone ?? null,
      checkIn: r.check_in,
      leavesOn: r.leaves_on,
      asked: r.asked_at !== null,
      guestReviewed: r.guest_reviewed_at !== null,
    }));

  const askFrom = addDaysISO(today, -ASK_FOR_DAYS);
  return {
    toAsk: rows.filter((r) => !r.asked && r.leavesOn >= askFrom),
    waiting: rows.filter((r) => r.asked),
  };
}

export type ReviewCounts = { asked: number; received: number };

/**
 * Per unit: how many guests were asked, and how many of those reviews came
 * in. One unit when given, otherwise every unit that has asked anyone.
 */
export async function reviewRequestCounts(
  supabase: SupabaseClient,
  propertyId?: string
): Promise<Map<string, ReviewCounts>> {
  const counts = new Map<string, ReviewCounts>();

  let query = supabase.from("review_requests").select("property_id, review_received_at").not("asked_at", "is", null);
  if (propertyId) query = query.eq("property_id", propertyId);
  const { data } = await query;

  for (const r of data ?? []) {
    const c = counts.get(r.property_id) ?? { asked: 0, received: 0 };
    c.asked += 1;
    if (r.review_received_at) c.received += 1;
    counts.set(r.property_id, c);
  }
  return counts;
}
