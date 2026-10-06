"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentUser, requireOwner } from "@/lib/auth";
import { airbnbListingUrl, airbnbRoomUrl } from "@/lib/listing-coach";

function back(propertyId: string | null, params: Record<string, string> = {}): never {
  const query = new URLSearchParams(params).toString();
  const path = propertyId ? `/admin/listing-coach/${propertyId}` : "/admin/listing-coach";
  revalidatePath("/admin/listing-coach", "layout");
  redirect(query ? `${path}?${query}` : path);
}

/** Attach a unit's Airbnb link and start watching it. Pasting again replaces the link. */
export async function addCoachListing(formData: FormData) {
  await requireOwner();
  const propertyId = String(formData.get("property_id") ?? "");
  const url = airbnbListingUrl(String(formData.get("airbnb_url") ?? ""));
  if (!propertyId) back(null, { error: "Pick a unit." });
  if (!url) back(null, { error: "That isn't an Airbnb listing link. Paste the address of the listing's page." });

  const supabase = await createClient();
  const { error } = await supabase
    .from("coach_listings")
    .upsert({ property_id: propertyId, airbnb_url: url, watching: true }, { onConflict: "property_id" });
  if (error) back(null, { error: error.message });

  back(null, { notice: "Added. Its first report comes with the next check." });
}

export async function setCoachWatching(formData: FormData) {
  await requireOwner();
  const propertyId = String(formData.get("property_id") ?? "");
  const watching = formData.get("watching") === "on";

  const supabase = await createClient();
  const { error } = await supabase.from("coach_listings").update({ watching }).eq("property_id", propertyId);
  if (error) back(null, { error: error.message });

  back(null);
}

export async function addCoachCompetitor(formData: FormData) {
  await requireOwner();
  const propertyId = String(formData.get("property_id") ?? "");
  const url = airbnbRoomUrl(String(formData.get("airbnb_url") ?? ""));
  if (!url) {
    back(propertyId, { error: "Paste the competitor's Airbnb link: the one with /rooms/ and a number in it." });
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("coach_competitors")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);
  if ((count ?? 0) >= 8) back(propertyId, { error: "Eight competitors is the most a check compares. Remove one first." });

  const { error } = await supabase
    .from("coach_competitors")
    .insert({ property_id: propertyId, airbnb_url: url, source: "staff" });
  if (error) {
    back(propertyId, {
      error: error.code === "23505" ? "That listing is already on the list." : error.message,
    });
  }

  back(propertyId, { notice: "Added. Its prices appear with the next check." });
}

export async function removeCoachCompetitor(formData: FormData) {
  await requireOwner();
  const propertyId = String(formData.get("property_id") ?? "");
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("coach_competitors").delete().eq("id", id).eq("property_id", propertyId);
  if (error) back(propertyId, { error: error.message });

  back(propertyId);
}

/** The Done tick, and taking it back. The next audit confirms it or hands it back. */
export async function tickCoachFix(formData: FormData) {
  await requireOwner();
  const user = await currentUser();
  const propertyId = String(formData.get("property_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const done = formData.get("done") === "on";

  const supabase = await createClient();
  const { error } = await supabase
    .from("coach_fixes")
    .update({ done_at: done ? new Date().toISOString() : null, done_by: done ? (user?.id ?? null) : null })
    .eq("id", id)
    .eq("property_id", propertyId)
    .is("confirmed_on", null);
  if (error) back(propertyId, { error: error.message });

  back(propertyId);
}
