import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether a client has anything a delete would destroy. Delete is for a client
 * added by mistake; one with stays, payments or books is deactivated instead.
 * The delete action refuses on it and the client page picks its button by it.
 */
export async function clientHasHistory(supabase: SupabaseClient, id: string): Promise<boolean> {
  const counts = await Promise.all(
    ["bookings", "client_payouts", "hostello_payouts", "expenses"].map((table) =>
      supabase.from(table).select("id", { count: "exact", head: true }).eq("client_id", id)
    )
  );
  return counts.some((r) => (r.count ?? 0) > 0);
}
