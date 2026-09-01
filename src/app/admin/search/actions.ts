"use server";

import { createClient } from "@/lib/supabase/server";
import { canSeeSplit, currentProfile } from "@/lib/auth";
import type { SearchResult } from "@/lib/search";

/**
 * Real server-side search across clients, properties, and bookings.
 * No fake/client-only filtering — this queries Supabase directly, scoped
 * by whatever RLS policy already applies to the caller (admin sees all).
 */
export async function searchAdmin(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const like = `%${q}%`;

  // Clients & Properties is the owner's. A client or property hit still means
  // something to ops — it means "show me that client's calendar" — so it goes
  // there instead of at a page they would be bounced off.
  const showMoney = canSeeSplit((await currentProfile())?.role);
  const clientHref = (id: string) =>
    showMoney ? `/admin/clients/${id}` : `/admin/calendar?client=${id}`;

  const [clientsRes, propertiesRes, bookingsRes] = await Promise.all([
    supabase.from("clients").select("id, name").ilike("name", like).limit(5),
    supabase
      .from("properties")
      .select("id, name, client_id, clients(name)")
      .ilike("name", like)
      .limit(5),
    supabase
      .from("bookings")
      .select("id, guest_name, check_in, check_out, client_id, clients(name)")
      .ilike("guest_name", like)
      .neq("status", "cancelled")
      .order("check_in", { ascending: false })
      .limit(5),
  ]);

  const results: SearchResult[] = [];

  for (const c of clientsRes.data ?? []) {
    results.push({
      kind: "client",
      id: c.id,
      title: c.name,
      subtitle: "Client",
      href: clientHref(c.id),
    });
  }

  for (const p of propertiesRes.data ?? []) {
    const clientName = (p.clients as unknown as { name: string } | null)?.name ?? "—";
    results.push({
      kind: "property",
      id: p.id,
      title: p.name,
      subtitle: `Property · ${clientName}`,
      href: clientHref(p.client_id),
    });
  }

  for (const b of bookingsRes.data ?? []) {
    const clientName = (b.clients as unknown as { name: string } | null)?.name ?? "—";
    const month = b.check_in.slice(0, 7);
    results.push({
      kind: "booking",
      id: b.id,
      title: b.guest_name ?? "Guest",
      subtitle: `Booking · ${clientName} · ${b.check_in} → ${b.check_out}`,
      href: `/admin/bookings?month=${month}`,
    });
  }

  return results;
}
