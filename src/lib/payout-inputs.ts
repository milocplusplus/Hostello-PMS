import type { SupabaseClient } from "@supabase/supabase-js";
import { currentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Who is allowed to *read* the numbers a split is computed from.
 *
 * An ops session is denied the deal terms, the stack rates and a booking's own
 * snapshots — that denial is the whole point of the role, and it holds at the
 * database, not just in the UI. But those columns are exactly what
 * `calculatePayout` needs when ops enters a booking, so the read has to happen
 * somewhere ops cannot reach.
 *
 * That somewhere is here: the server does it with the service-role client, and
 * the values never pass through a relation the ops JWT could query for itself.
 * **The revenue math does not move** — `payout.ts` is still the only place it
 * lives, and still runs in the Server Action. All that changes is who fetched
 * the inputs.
 *
 * For the owner and for a property owner nothing changes at all: they read the
 * columns with their own session, exactly as before.
 */
export type PayoutReader =
  | { ok: true; client: SupabaseClient }
  | { ok: false; error: string };

const NO_KEY =
  "Operations accounts cannot save bookings until SUPABASE_SERVICE_ROLE_KEY is set on this deployment — " +
  "the split has to be worked out from deal terms an operations login is not allowed to read. " +
  "Ask the owner to add it, or have the owner save this booking.";

export async function payoutReader(sessionClient: SupabaseClient): Promise<PayoutReader> {
  const profile = await currentProfile();

  // Everyone but ops reads the inputs as themselves.
  if (profile?.role !== "ops") return { ok: true, client: sessionClient };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: NO_KEY };
  return { ok: true, client: admin };
}

/** Whether an ops login can currently save a booking. Shown on the Staff page. */
export function opsCanPriceBookings(): boolean {
  return createAdminClient() !== null;
}
