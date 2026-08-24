"use server";

import { createClient } from "@/lib/supabase/server";

export type SearchResult = {
  kind: "client" | "property" | "booking";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

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
      href: `/admin/clients/${c.id}`,
    });
  }

  for (const p of propertiesRes.data ?? []) {
    const clientName = (p.clients as unknown as { name: string } | null)?.name ?? "—";
    results.push({
      kind: "property",
      id: p.id,
      title: p.name,
      subtitle: `Property · ${clientName}`,
      href: `/admin/clients/${p.client_id}`,
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
