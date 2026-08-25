import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
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

export type CurrentClient = {
  id: string;
  name: string;
  deal_model: DealModel;
  share_percent: number | null;
  deduct_percent: number | null;
  ota_model: OtaModel | null;
  ota_share_percent: number | null;
};

/** The client record the signed-in owner belongs to. Selects the superset of
 *  columns the portal uses so one cached row serves every page. */
export const currentClient = cache(async (): Promise<CurrentClient | null> => {
  const user = await currentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, name, deal_model, share_percent, deduct_percent, ota_model, ota_share_percent")
    .eq("owner_user_id", user.id)
    .single();
  return data as CurrentClient | null;
});
