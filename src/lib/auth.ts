import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_COOKIE } from "@/lib/view-as";
import type { DealModel, OtaModel } from "@/lib/payout";

/**
 * Per-request identity lookups.
 *
 * A layout and the page inside it both need the user, the profile and (in the
 * client portal) the client record, and each one is a network round trip to
 * Supabase. React's `cache()` makes them one round trip per request instead of
 * one per call site — the single cheapest latency win in the app, since the
 * database lives a continent away from the function that queries it.
 *
 * These are for reads on the server. Server Actions get their own request, so
 * they still pay for one lookup each, which is correct.
 */

export const currentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export type CurrentProfile = { role: string; full_name: string | null };

export const currentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const user = await currentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  return data;
});

/**
 * Who works for Hostello, and what they are allowed to see.
 *
 * `admin` is the owner — the whole business, money included. `ops` is the
 * operations team: the same stays, dates and guests, but never the split. Both
 * live under `/admin`; the portal is *labelled* by role, and the one rule that
 * matters is `canSeeSplit`. Anything that renders `hostello_share`,
 * `client_payout`, `net_sale`, a deal model or a settlement state is behind it.
 * Sale price and the advance are not — ops takes the money at the door.
 */
export type StaffRole = "admin" | "ops";

export function isStaffRole(role: string | undefined | null): role is StaffRole {
  return role === "admin" || role === "ops";
}

/** The owner's own view. Ops sees the same stay without the money on it. */
export function canSeeSplit(role: string | undefined | null): boolean {
  return role === "admin";
}

/**
 * Guard for a page only the owner may open. Ops is sent to their dashboard
 * rather than the login screen — they are signed in, just not for this.
 */
export async function requireOwner(): Promise<CurrentProfile> {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/admin");
  return profile;
}

/**
 * Guard for a Server Action only Hostello staff may run. Ops is staff here —
 * the split is what ops is kept away from, not the stay.
 *
 * A `layout.tsx` guards a page render, not an action: an action is its own
 * endpoint and can be POSTed by anyone signed in. That mattered less while
 * every booking write went through RLS, which refused a client writing another
 * client's row on its own. The money columns are now written with the
 * service-role key, which RLS does not apply to, so this is the check that
 * replaces it — see `bookingWriter()`.
 */
export async function requireStaff(): Promise<CurrentProfile> {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  if (!isStaffRole(profile.role)) redirect("/client");
  return profile;
}

export type CurrentClient = {
  id: string;
  name: string;
  owner_user_id: string | null;
  deal_model: DealModel;
  share_percent: number | null;
  deduct_percent: number | null;
  ota_model: OtaModel | null;
  ota_share_percent: number | null;
};

const CLIENT_COLUMNS =
  "id, name, owner_user_id, deal_model, share_percent, deduct_percent, ota_model, ota_share_percent";

/**
 * "View as owner": the admin browsing the owner portal as one client, read-only.
 *
 * The cookie is scoped to `/client`, so it only ever reaches owner-portal
 * requests, and it only counts when the signed-in user is the admin — anyone
 * else holding it gets nothing from it. Writes are refused in `middleware.ts`:
 * every Server Action is a POST, and no POST to `/client` passes while the
 * cookie is set. That is also why every owner page has to filter by
 * `clientRecord.id` itself rather than lean on RLS — the admin's session can
 * read every client.
 */
export const viewingAs = cache(async (): Promise<string | null> => {
  const id = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const profile = await currentProfile();
  return profile?.role === "admin" ? id : null;
});

/** The client record the signed-in owner belongs to — or, for the admin viewing
 *  as an owner, that owner's. Selects the superset of columns the portal uses
 *  so one cached row serves every page. */
export const currentClient = cache(async (): Promise<CurrentClient | null> => {
  const user = await currentUser();
  if (!user) return null;
  const supabase = await createClient();
  const viewAs = await viewingAs();
  const { data } = await (viewAs
    ? supabase.from("clients").select(CLIENT_COLUMNS).eq("id", viewAs)
    : supabase.from("clients").select(CLIENT_COLUMNS).eq("owner_user_id", user.id)
  ).single();
  return data as CurrentClient | null;
});

/**
 * Whose notifications the owner portal shows: the signed-in owner's, or while
 * viewing as, the viewed owner's login (null when they have none).
 */
export async function portalUserId(): Promise<string | null> {
  const [user, viewAs, client] = await Promise.all([currentUser(), viewingAs(), currentClient()]);
  if (!user) return null;
  return viewAs ? (client?.owner_user_id ?? null) : user.id;
}
