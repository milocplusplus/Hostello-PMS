"use server";

import { createClient } from "@/lib/supabase/server";
import type { SearchResult } from "@/lib/search";

/**
 * The owner-facing half of global search. RLS already scopes every table to the
 * caller's own client record, so this needs no extra client_id filter — but the
 * hrefs have to point at the client portal, which is why it isn't `searchAdmin`.
 */
export async function searchClient(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const like = `%${q}%`;

  const [propertiesRes, bookingsRes] = await Promise.all([
    supabase.from("properties").select("id, name, city").ilike("name", like).limit(5),
    supabase
      .from("bookings_v")
      .select("id, guest_name, check_in, check_out, status")
      .ilike("guest_name", like)
      .order("check_in", { ascending: false })
      .limit(5),
  ]);

  const results: SearchResult[] = [];

  for (const p of propertiesRes.data ?? []) {
    results.push({
      kind: "property",
      id: p.id,
      title: p.name,
      subtitle: p.city ? `Property · ${p.city}` : "Property",
      href: "/client/calendar",
    });
  }

  for (const b of bookingsRes.data ?? []) {
    results.push({
      kind: "booking",
      id: b.id,
      title: b.guest_name ?? "Guest",
      subtitle: `Booking · ${b.check_in} → ${b.check_out}${
        b.status === "cancelled" ? " · cancelled" : ""
      }`,
      href: `/client/bookings/${b.id}`,
    });
  }

  return results;
}
