import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { fetchFeed, type IcalEvent } from "./ical.ts";

/**
 * The one place channel calendars are read.
 *
 * It exists as an edge function rather than as app code because pg_cron has to
 * be able to call it, and nothing external can call a Next.js Server Action.
 * Putting a second copy of the fetch/parse in the app would mean two
 * implementations drifting apart, so the app calls this too — see
 * src/lib/ical-sync.ts, which is now only a caller.
 *
 * What it does NOT decide: what counts as booked, what a stale row is, when a
 * clash is worth a notification. Those are rules, and rules live in
 * `sync_calendar_feed_apply()` next to the data.
 *
 *   POST { action: "sync", feed_id? }
 *   POST { action: "check", property_ids, check_in, check_out }
 *
 * Two ways in: an admin's session JWT (the "Sync now" button) or the shared
 * secret in `X-Sync-Secret` (the schedule). JWT verification is off at the
 * gateway because the cron path has no JWT to present; both paths are checked
 * below instead.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** How long the whole "is this night already sold" look may take, in total. */
const CHECK_BUDGET_MS = 6_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function rpc<T>(name: string, args: unknown, accessToken = SERVICE_ROLE_KEY): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) throw new Error(`rpc ${name} ${res.status}: ${await res.text()}`);

  return (await res.json()) as T;
}

async function select<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });

  if (!res.ok) throw new Error(`select ${path} ${res.status}: ${await res.text()}`);

  return (await res.json()) as T[];
}

/** An admin's JWT, or the schedule's secret. Anything else is a 401. */
async function authorize(req: Request): Promise<boolean> {
  const secret = req.headers.get("X-Sync-Secret");

  if (secret) {
    return await rpc<boolean>("is_ical_sync_secret", { p_secret: secret });
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;

  const token = auth.slice(7);

  // Ask the database who this is. `is_admin()` reads auth.uid(), so it has to
  // run as the caller, not as the service role.
  try {
    return await rpc<boolean>("is_admin", {}, token);
  } catch {
    return false;
  }
}

type FeedRow = { id: string; url: string; property_id: string };

async function syncOne(feed: FeedRow): Promise<Record<string, unknown>> {
  let events: IcalEvent[];

  try {
    events = await fetchFeed(feed.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach that calendar link.";
    await rpc("sync_calendar_feed_failed", { p_feed_id: feed.id, p_error: message });
    return { feed_id: feed.id, error: message };
  }

  const result = await rpc<Record<string, unknown>>("sync_calendar_feed_apply", {
    p_feed_id: feed.id,
    p_events: events,
  });

  return { feed_id: feed.id, ...result };
}

async function handleSync(feedId: string | undefined) {
  const feeds = feedId
    ? await select<FeedRow>(`calendar_feeds?id=eq.${encodeURIComponent(feedId)}&select=id,url,property_id`)
    : await select<FeedRow>("calendar_feeds?active=is.true&select=id,url,property_id");

  const results = [];
  for (const feed of feeds) {
    results.push(await syncOne(feed));
  }

  const totals = { feeds: results.length, added: 0, updated: 0, removed: 0, clashes: 0 };
  let error: string | null = null;

  for (const r of results) {
    totals.added += Number(r.added ?? 0);
    totals.updated += Number(r.updated ?? 0);
    totals.removed += Number(r.removed ?? 0);
    totals.clashes += Number(r.clashes ?? 0);
    if (typeof r.error === "string") error = r.error;
  }

  return json({ ...totals, error });
}

/**
 * A live look at the channels before a booking is written, for the minutes
 * between one scheduled sync and the next.
 *
 * `check_out` is exclusive, the feed's nights are inclusive: they overlap when
 * the stay starts on or before the last night and ends after the first.
 *
 * This never writes and never fails the caller: if a channel is slow or down,
 * it returns what it has. Refusing to sell a room because Airbnb was
 * unreachable would be a worse outage than the one it is guarding against.
 */
async function handleCheck(body: Record<string, unknown>) {
  const propertyIds = Array.isArray(body.property_ids) ? (body.property_ids as string[]) : [];
  const checkIn = String(body.check_in ?? "");
  const checkOut = String(body.check_out ?? "");

  if (propertyIds.length === 0 || !checkIn || !checkOut) {
    return json({ clashes: [], checked: 0 });
  }

  // Shape-checked, then interpolated bare: percent-encoding the list would turn
  // its separating commas into literal ones and PostgREST would read the whole
  // thing as a single id.
  const safe = propertyIds.filter((id) => /^[0-9a-fA-F-]{36}$/.test(id));
  if (safe.length === 0) return json({ clashes: [], checked: 0 });

  const feeds = await select<FeedRow>(
    `calendar_feeds?active=is.true&property_id=in.(${safe.join(",")})&select=id,url,property_id`
  );

  if (feeds.length === 0) return json({ clashes: [], checked: 0 });

  const deadline = new Promise<IcalEvent[]>((resolve) =>
    setTimeout(() => resolve([]), CHECK_BUDGET_MS)
  );

  const clashes: { property_id: string; start: string; end: string }[] = [];

  const looks = feeds.map(async (feed) => {
    const events = await Promise.race([fetchFeed(feed.url).catch(() => [] as IcalEvent[]), deadline]);

    for (const event of events) {
      if (event.start < checkOut && event.end >= checkIn) {
        clashes.push({ property_id: feed.property_id, start: event.start, end: event.end });
      }
    }
  });

  await Promise.all(looks);

  return json({ clashes, checked: feeds.length });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!(await authorize(req))) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;

  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    if (body.action === "check") return await handleCheck(body);
    return await handleSync(body.feed_id as string | undefined);
  } catch (err) {
    console.error("ical-sync failed", err);
    return json({ error: "Sync failed. Check the function logs." }, 500);
  }
});
