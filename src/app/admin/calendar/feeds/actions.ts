"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { syncAllFeeds, syncFeed, type SyncResult } from "@/lib/ical-sync";

function backTo(params: Record<string, string>) {
  return `/admin/calendar/feeds?${new URLSearchParams(params).toString()}`;
}

/** The connect form again, with the unit that was picked still picked. */
function connectError(error: string, property: string) {
  return `/admin/calendar/feeds/connect?${new URLSearchParams({ error, ...(property ? { property } : {}) }).toString()}`;
}

/** The outgoing links have their own page. */
function outgoing(params: Record<string, string>) {
  return `/admin/calendar/feeds/outgoing?${new URLSearchParams(params).toString()}`;
}

/** A clash is the thing worth reading twice, so it goes last and in words. */
function syncNotice(result: SyncResult, prefix: string) {
  const parts = `${prefix} — ${result.added} new, ${result.updated} changed, ${result.removed} reopened.`;
  return result.clashes > 0
    ? `${parts} ${result.clashes} of them clash with a booking we already had — see Activity.`
    : parts;
}

/**
 * The server fetches whatever URL is saved here, so it may only ever be a
 * public https link — never a loopback or private address that would let the
 * form reach something inside the deployment.
 */
function validateFeedUrl(raw: string): string | null {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return "That doesn't look like a link. Paste the whole https:// address.";
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "Calendar links have to start with https://.";
  }

  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host.endsWith(".local") ||
    /^(127|10)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]";

  if (isPrivate) return "That address isn't reachable from the internet.";

  return null;
}

export async function addCalendarFeed(formData: FormData) {
  const property_id = (formData.get("property_id") as string) || "";
  const url = ((formData.get("url") as string) || "").trim();
  const source = ((formData.get("source") as string) || "airbnb").trim();
  const label = ((formData.get("label") as string) || "").trim() || null;
  // Routes this channel's reservation emails to this property — see the
  // channel inbox. Optional: the calendar link works without it.
  const listing_ref = ((formData.get("listing_ref") as string) || "").trim() || null;

  if (!property_id) redirect(connectError("Pick a unit.", property_id));
  if (!url) redirect(connectError("Paste the calendar link.", property_id));

  const urlError = validateFeedUrl(url);
  if (urlError) redirect(connectError(urlError, property_id));

  const supabase = await createClient();
  const user = await currentUser();

  const { data: feed, error } = await supabase
    .from("calendar_feeds")
    .insert({ property_id, url, source, label, listing_ref, created_by: user?.id ?? null })
    .select("id")
    .single();

  if (error) {
    const message = error.code === "23505" ? "That link is already connected to this unit." : error.message;
    redirect(connectError(message, property_id));
  }

  // Pull it straight away: a link that is wrong should say so now, not in an
  // hour, and a correct one should show its dates immediately.
  const result = await syncFeed(supabase, feed.id);

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/calendar/feeds");
  revalidatePath("/client", "layout");

  redirect(
    result.error
      ? backTo({ error: result.error })
      : backTo({ notice: syncNotice(result, "Connected") })
  );
}

export async function syncCalendarFeed(formData: FormData) {
  const id = (formData.get("id") as string) || "";
  const supabase = await createClient();

  const result = await syncFeed(supabase, id);

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/calendar/feeds");
  revalidatePath("/client", "layout");

  redirect(
    result.error
      ? backTo({ error: result.error })
      : backTo({ notice: syncNotice(result, "Synced") })
  );
}

export async function syncAllCalendarFeeds() {
  const supabase = await createClient();

  const result = await syncAllFeeds(supabase);

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/calendar/feeds");
  revalidatePath("/client", "layout");

  if (result.feeds === 0) redirect(backTo({ notice: "No calendars connected yet." }));

  redirect(
    result.error
      ? backTo({ error: result.error })
      : backTo({ notice: syncNotice(result, `Synced ${result.feeds} calendars`) })
  );
}

/**
 * Set (or correct) the listing name that routes this channel's reservation
 * emails here. Separate from the rest of the feed because it is the one field
 * an admin discovers they got wrong *after* an email fails to match.
 */
export async function setListingRef(formData: FormData) {
  const id = (formData.get("id") as string) || "";
  const listing_ref = ((formData.get("listing_ref") as string) || "").trim() || null;

  const supabase = await createClient();

  const { error } = await supabase
    .from("calendar_feeds")
    .update({ listing_ref })
    .eq("id", id);

  if (error) redirect(backTo({ error: error.message }));

  revalidatePath("/admin/calendar/feeds");
  revalidatePath("/admin/channel-inbox");

  redirect(
    backTo({
      notice: listing_ref
        ? `Reservation emails naming "${listing_ref}" will route to this property.`
        : "Listing name cleared — this channel's emails will need assigning by hand.",
    })
  );
}

/**
 * Pause or resume one link. Paused, the every-minute sync skips it (it only
 * reads `active` links) and the dates it already brought in stay put.
 */
export async function setCalendarFeedActive(formData: FormData) {
  const id = (formData.get("id") as string) || "";
  const active = formData.get("active") === "true";
  const supabase = await createClient();

  const { error } = await supabase.from("calendar_feeds").update({ active }).eq("id", id);
  if (error) redirect(backTo({ error: error.message }));

  revalidatePath("/admin/calendar/feeds");
  redirect(
    backTo({
      notice: active ? "Resumed — it syncs again within a minute." : "Paused. Its dates stay on the calendar.",
    })
  );
}

/** Removing the link removes the dates it brought in (the FK cascades). */
export async function removeCalendarFeed(formData: FormData) {
  const id = (formData.get("id") as string) || "";
  const supabase = await createClient();

  const { error } = await supabase.from("calendar_feeds").delete().eq("id", id);

  if (error) redirect(backTo({ error: error.message }));

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/calendar/feeds");
  revalidatePath("/client", "layout");

  redirect(backTo({ notice: "Calendar disconnected and its dates removed." }));
}

// ---- Publishing our calendar out to a channel -----------------------------
// The other direction. A channel fetches this anonymously, so the link is a
// secret token and the document it returns carries dates only.

export async function createCalendarExport(formData: FormData) {
  const property_id = (formData.get("property_id") as string) || "";

  if (!property_id) redirect(outgoing({ error: "Pick a unit." }));

  const supabase = await createClient();
  const user = await currentUser();

  const { error } = await supabase
    .from("calendar_exports")
    .insert({ property_id, created_by: user?.id ?? null });

  if (error) {
    const message =
      error.code === "23505" ? "That unit already has a link." : error.message;
    redirect(outgoing({ error: message }));
  }

  revalidatePath("/admin/calendar/feeds/outgoing");
  redirect(outgoing({ notice: "Link created. Paste it into the channel to publish these dates." }));
}

/** Invalidates the old URL and issues a new one — for a link that leaked. */
export async function regenerateCalendarExport(formData: FormData) {
  const id = (formData.get("id") as string) || "";

  const supabase = await createClient();

  const { error } = await supabase
    .from("calendar_exports")
    .update({ token: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""), fetch_count: 0, last_fetched_at: null })
    .eq("id", id);

  if (error) redirect(outgoing({ error: error.message }));

  revalidatePath("/admin/calendar/feeds/outgoing");
  redirect(
    outgoing({
      notice: "New link issued. The old one stops working now — paste the new one into the channel.",
    })
  );
}

export async function removeCalendarExport(formData: FormData) {
  const id = (formData.get("id") as string) || "";

  const supabase = await createClient();

  const { error } = await supabase.from("calendar_exports").delete().eq("id", id);

  if (error) redirect(outgoing({ error: error.message }));

  revalidatePath("/admin/calendar/feeds/outgoing");
  redirect(outgoing({ notice: "Link deleted. Any channel still pointed at it will stop updating." }));
}
