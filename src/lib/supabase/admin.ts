import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/**
 * Service-role client. Server-only, and used for exactly one thing: sending a
 * push notification needs to read *other people's* push subscriptions, which no
 * signed-in session is allowed to do (nor should be).
 *
 * Everything else in the app — including writing notifications, via the
 * `emit_notification` RPC — runs as the signed-in user under RLS. If the key is
 * not configured this returns null and push is skipped; the in-app feed, the
 * unread counts and the realtime updates all keep working.
 */
let cached: SupabaseClient | null | undefined;

export function createAdminClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  // Same rule as the anon key in ./config: a value that cannot survive an HTTP
  // header would break every call, so treat a corrupted one as missing.
  if (!key || !/^[\x21-\x7e]+$/.test(key)) {
    cached = null;
    return cached;
  }

  cached = createSupabaseClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
