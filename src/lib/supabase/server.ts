import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";
import { VIEW_AS_COOKIE } from "../view-as";

/**
 * Supabase client for use in Server Components, Route Handlers,
 * and Server Actions. Reads/writes the session cookie so auth
 * state is available on the server.
 */
export async function createClient() {
  const cookieStore = await cookies();

  // The admin looking at a self-serve host through "View as owner". Hostello's own
  // screens cannot see a host's rows; this header is the one way in, and the
  // database honours it for an admin only (`staff_may_see_client`). The cookie is
  // scoped to /client, so an admin page never carries it.
  const viewAs = cookieStore.get(VIEW_AS_COOKIE)?.value;
  const viewAsHeader =
    viewAs && /^[0-9a-f-]{36}$/i.test(viewAs) ? { "x-hostello-view-as": viewAs } : undefined;

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: viewAsHeader ? { headers: viewAsHeader } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component without a mutable cookie store.
            // Safe to ignore if middleware is refreshing sessions.
          }
        },
      },
    }
  );
}
