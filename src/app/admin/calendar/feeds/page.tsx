import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Building2, Plus, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { SubmitButton } from "@/components/shared/Busy";
import { errorBanner, noticeBanner } from "@/lib/form-styles";
import { feedHealth } from "@/lib/channel-health";
import { PageHeader, EmptyState } from "@/components/shared/PageHeader";
import {
  ChannelConnections,
  type ConnectionClient,
  type ConnectionFeed,
  type ConnectionRun,
} from "@/components/admin/ChannelConnections";
import { syncAllCalendarFeeds } from "./actions";

type UnitRow = {
  id: string;
  name: string;
  bookable: boolean;
  clients: { name: string; deactivated_at: string | null } | null;
};

/**
 * Every unit and the channel calendars it reads from, with each link's health.
 * Connecting one is its own page (`connect/`), and so are the links that send
 * our dates out (`outgoing/`): this page is for seeing what is and is not working.
 */
export default async function ChannelCalendarsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const [{ data: properties }, { data: feeds }, { data: runs }] = await Promise.all([
    supabase.from("properties_v").select("id, name, bookable, clients:clients_v(name, deactivated_at)"),
    supabase
      .from("calendar_feeds")
      .select(
        "id, property_id, source, label, listing_ref, last_synced_at, last_error, last_event_count, active, consecutive_failures, last_success_at, created_at"
      )
      .order("created_at"),
    // Only runs that changed something or failed are stored, so this is short.
    supabase
      .from("calendar_sync_runs")
      .select("feed_id, at, ok, added, updated, removed, clashes, error")
      .order("at", { ascending: false })
      .limit(300),
  ]);

  const runsByFeed = new Map<string, ConnectionRun[]>();
  for (const run of (runs ?? []) as ConnectionRun[]) {
    const list = runsByFeed.get(run.feed_id) ?? [];
    if (list.length < 15) list.push(run);
    runsByFeed.set(run.feed_id, list);
  }

  const feedsByUnit = new Map<string, ConnectionFeed[]>();
  for (const f of (feeds ?? []) as (ConnectionFeed & { property_id: string })[]) {
    feedsByUnit.set(f.property_id, [...(feedsByUnit.get(f.property_id) ?? []), f]);
  }

  // A unit that can take bookings, or one that still has a link to look after.
  const byClient = new Map<string, ConnectionClient>();
  for (const p of (properties ?? []) as unknown as UnitRow[]) {
    const unitFeeds = feedsByUnit.get(p.id) ?? [];
    if (!p.bookable && unitFeeds.length === 0) continue;
    const name = p.clients?.name ?? "No client";
    const client = byClient.get(name) ?? { name, deactivated: Boolean(p.clients?.deactivated_at), units: [] };
    client.units.push({ id: p.id, name: p.name, feeds: unitFeeds });
    byClient.set(name, client);
  }
  const clients = [...byClient.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const c of clients) c.units.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const units = clients.flatMap((c) => c.units.map((u) => ({ ...u, deactivated: c.deactivated })));
  const connected = units.reduce((n, u) => n + u.feeds.length, 0);
  const failing = units.reduce(
    (n, u) => n + u.feeds.filter((f) => feedHealth({ ...f, clientDeactivated: u.deactivated }).tone === "bad").length,
    0
  );
  const missing = units.filter((u) => !u.deactivated && !u.feeds.some((f) => f.source === "airbnb")).length;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      <PageHeader
        title="Channel calendars"
        back={{ href: "/admin/calendar", label: "Calendar" }}
        info={
          <>
            <p>
              A channel calendar is a link from Airbnb or Booking.com that Hostello reads every
              minute, so the nights they sell are closed here too. It carries dates only: no guest
              name and no price.
            </p>
            <p className="mt-2">
              Healthy means the last read worked. Failing means five in a row did not, and No
              recent sync means nothing has been read for half an hour. Sync now reads one link
              straight away.
            </p>
          </>
        }
        actions={
          <Link href="/admin/calendar/feeds/connect" className="btn btn-gold btn-sm">
            <Plus size={14} aria-hidden />
            <span className="hidden sm:inline">Connect a calendar</span>
            <span className="sm:hidden">Connect</span>
          </Link>
        }
      />

      {notice && <p className={noticeBanner}>{notice}</p>}
      {error && <p className={errorBanner}>{error}</p>}

      {units.length === 0 ? (
        <EmptyState icon={Building2} title={<>No units yet.</>} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="num text-sm text-ink-secondary flex-1 min-w-[12rem]">
              <span className="text-ink-primary font-semibold">{connected}</span> connected
              {failing > 0 && (
                <>
                  {" · "}
                  <span className="text-status-booked font-semibold">{failing}</span> failing
                </>
              )}
              {missing > 0 && (
                <>
                  {" · "}
                  <span className="text-ink-primary font-semibold">{missing}</span> not on Airbnb&apos;s calendar
                </>
              )}
            </p>
            {connected > 0 && (
              <form action={syncAllCalendarFeeds}>
                <SubmitButton
                  className="btn btn-ghost btn-sm"
                  blocking
                  busy="Syncing every calendar…"
                  note="Each channel is fetched in turn — this is the slow one."
                >
                  <RefreshCw size={13} aria-hidden />
                  Sync all
                </SubmitButton>
              </form>
            )}
            <Link
              href="/admin/calendar/feeds/outgoing"
              className="text-xs font-bold text-ink-muted hover:text-ink-primary inline-flex items-center gap-1 transition-colors"
            >
              Send our dates out
              <ArrowUpRight size={13} aria-hidden />
            </Link>
          </div>

          <ChannelConnections clients={clients} runs={runsByFeed} />
        </>
      )}
    </div>
  );
}
