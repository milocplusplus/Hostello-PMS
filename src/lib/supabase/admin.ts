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

function serviceKey(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  // Same rule as the anon key in ./config: a value that cannot survive an HTTP
  // header would break every call, so treat a corrupted one as missing.
  if (!key || !/^[\x21-\x7e]+$/.test(key)) return null;
  return key;
}

export function createAdminClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const key = serviceKey();
  cached = key
    ? createSupabaseClient(SUPABASE_URL, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
  return cached;
}

/**
 * The same service-role client, carrying who it is writing for. A write made
 * with the key has no `auth.uid()`, so the audit log would call it "System";
 * `audit_uid()` reads this header instead — and only from a request that
 * carries the service-role key, so a browser sending it proves nothing.
 */
export function createActingAdminClient(userId: string | null): SupabaseClient | null {
  const key = serviceKey();
  if (!key) return null;
  return createSupabaseClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: userId ? { headers: { "x-hostello-actor": userId } } : undefined,
  });
}
