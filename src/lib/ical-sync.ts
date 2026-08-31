import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase/config";
import { formatDayMonth } from "./calendar";

/**
 * Talking to the channel-calendar sync.
 *
 * The fetching and parsing does **not** happen here — it lives in the
 * `ical-sync` edge function (supabase/functions/ical-sync/), because pg_cron
 * has to be able to run the same sync on a schedule and nothing external can
 * call a Server Action. This file is only the app's way in, so that the button
 * an admin presses and the job that runs every minute are the same code.
 *
 * The caller's own session is what authorises it: the function asks the
 * database whether that user is an admin. No service-role key is needed here.
 */

export type SyncResult = {
  feeds: number;
  added: number;
  updated: number;
  removed: number;
  clashes: number;
  error: string | null;
};

const EMPTY: SyncResult = { feeds: 0, added: 0, updated: 0, removed: 0, clashes: 0, error: null };
const ENDPOINT = `${SUPABASE_URL}/functions/v1/ical-sync`;

async function invoke<T>(supabase: SupabaseClient, body: unknown, timeoutMs: number): Promise<T | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A channel can be slow; a sync the admin is watching gets a minute. */
const SYNC_TIMEOUT_MS = 60_000;

export async function syncFeed(supabase: SupabaseClient, feedId: string): Promise<SyncResult> {
  const result = await invoke<SyncResult>(supabase, { action: "sync", feed_id: feedId }, SYNC_TIMEOUT_MS);
  return result ?? { ...EMPTY, error: "Could not reach the sync service. Try again in a moment." };
}

export async function syncAllFeeds(supabase: SupabaseClient): Promise<SyncResult> {
  const result = await invoke<SyncResult>(supabase, { action: "sync" }, SYNC_TIMEOUT_MS);
  return result ?? { ...EMPTY, error: "Could not reach the sync service. Try again in a moment." };
}

/**
 * Asks the channels directly whether these nights are already sold, covering
 * the seconds between one scheduled sync and the next.
 *
 * Returns the reason not to write the booking, or null. **Silence means go**:
 * a slow or broken channel returns null, because refusing to take a booking
 * because Airbnb was unreachable is a worse failure than the double-booking
 * this is guarding against. The every-minute sync is the standing safety net;
 * this is what makes the gap between two of its runs not matter.
 */
export async function checkChannelClash(
  supabase: SupabaseClient,
  args: { propertyIds: string[]; checkIn: string; checkOut: string }
): Promise<string | null> {
  if (args.propertyIds.length === 0) return null;

  // Almost every property has no channel connected, and for those this must
  // cost nothing. One indexed local query is far cheaper than a round trip to
  // the edge function only to be told there was nothing to look at.
  const { data: feeds } = await supabase
    .from("calendar_feeds")
    .select("id")
    .in("property_id", args.propertyIds)
    .eq("active", true)
    .limit(1);

  if (!feeds || feeds.length === 0) return null;

  const result = await invoke<{ clashes: { start: string; end: string }[] }>(
    supabase,
    {
      action: "check",
      property_ids: args.propertyIds,
      check_in: args.checkIn,
      check_out: args.checkOut,
    },
    8_000
  );

  const clash = result?.clashes?.[0];
  if (!clash) return null;

  const range =
    clash.start === clash.end
      ? formatDayMonth(clash.start)
      : `${formatDayMonth(clash.start)} → ${formatDayMonth(clash.end)}`;

  return `A channel has just sold those nights on one of the selected units (${range}). It is not on the calendar yet — the next sync will bring it in.`;
}
