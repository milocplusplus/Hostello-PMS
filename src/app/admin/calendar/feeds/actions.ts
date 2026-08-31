"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { syncAllFeeds, syncFeed, type SyncResult } from "@/lib/ical-sync";

function backTo(params: Record<string, string>) {
  return `/admin/calendar/feeds?${new URLSearchParams(params).toString()}`;
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

  if (!property_id) redirect(backTo({ error: "Pick a property." }));
  if (!url) redirect(backTo({ error: "Paste the calendar link." }));

  const urlError = validateFeedUrl(url);
  if (urlError) redirect(backTo({ error: urlError }));

  const supabase = await createClient();
  const user = await currentUser();

  const { data: feed, error } = await supabase
    .from("calendar_feeds")
    .insert({ property_id, url, source, label, created_by: user?.id ?? null })
    .select("id")
    .single();

  if (error) {
    const message = error.code === "23505" ? "That link is already connected to this property." : error.message;
    redirect(backTo({ error: message }));
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

  if (!property_id) redirect(backTo({ error: "Pick a property." }));

  const supabase = await createClient();
  const user = await currentUser();

  const { error } = await supabase
    .from("calendar_exports")
    .insert({ property_id, created_by: user?.id ?? null });

  if (error) {
    const message =
      error.code === "23505" ? "That property already has a link." : error.message;
    redirect(backTo({ error: message }));
  }

  revalidatePath("/admin/calendar/feeds");
  redirect(backTo({ notice: "Link created. Paste it into the channel to publish these dates." }));
}

/** Invalidates the old URL and issues a new one — for a link that leaked. */
export async function regenerateCalendarExport(formData: FormData) {
  const id = (formData.get("id") as string) || "";

  const supabase = await createClient();

  const { error } = await supabase
    .from("calendar_exports")
    .update({ token: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""), fetch_count: 0, last_fetched_at: null })
    .eq("id", id);

  if (error) redirect(backTo({ error: error.message }));

  revalidatePath("/admin/calendar/feeds");
  redirect(
    backTo({
      notice: "New link issued. The old one stops working now — paste the new one into the channel.",
    })
  );
}

export async function removeCalendarExport(formData: FormData) {
  const id = (formData.get("id") as string) || "";

  const supabase = await createClient();

  const { error } = await supabase.from("calendar_exports").delete().eq("id", id);

  if (error) redirect(backTo({ error: error.message }));

  revalidatePath("/admin/calendar/feeds");
  redirect(backTo({ notice: "Link deleted. Any channel still pointed at it will stop updating." }));
}
