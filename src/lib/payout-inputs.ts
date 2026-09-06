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

const NO_WRITER =
  "Bookings cannot be saved until SUPABASE_SERVICE_ROLE_KEY is set on this deployment — " +
  "the split is written with a credential the browser does not hold, so that a session " +
  "cannot write itself a bigger payout. Ask the owner to add it.";

/**
 * Who is allowed to *write* the numbers a split is made of.
 *
 * `net_sale`, `hostello_share`, `client_payout` and the deal snapshots carry no
 * column grant for `authenticated`. They cannot, safely: a column grant is per
 * Postgres role, and every signed-in user — the owner, ops and a property owner
 * alike — is the same role, `authenticated`. A grant wide enough for the app to
 * save a booking is a grant wide enough for an owner to PATCH themselves a
 * larger `client_payout`.
 *
 * So the figures are written with the service-role key instead, which lives on
 * the server and never reaches a browser. **The revenue math does not move** —
 * `payout.ts` is still the only place it lives, and `calculatePayout()` still
 * runs in the Server Action. All that changes is which credential performs the
 * insert.
 *
 * **RLS does not apply to this client.** Every caller must therefore have
 * established that the row is theirs *before* asking for it — the client portal
 * checks the booking and every unit against the caller's own client record, and
 * the admin paths call `requireStaff()`. Never reach for this and let the write
 * be the thing that refuses; it will not refuse.
 */
export function bookingWriter(): PayoutReader {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: NO_WRITER };
  return { ok: true, client: admin };
}

/** Whether an ops login can currently save a booking. Shown on the Staff page. */
export function opsCanPriceBookings(): boolean {
  return createAdminClient() !== null;
}
