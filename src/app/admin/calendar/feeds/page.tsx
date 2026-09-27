import Link from "next/link";
import { redirect } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { SubmitButton } from "@/components/shared/Busy";
import { CopyLinkButton } from "@/components/admin/CopyLinkButton";
import { BOOKING_SOURCES, sourceColor, sourceLabel } from "@/lib/block-sources";
import { SUPABASE_URL } from "@/lib/supabase/config";
import {
  fieldLabel,
  fieldInput,
  primaryButton,
  secondaryButton,
  errorBanner,
  noticeBanner,
} from "@/lib/form-styles";
import {
  addCalendarFeed,
  createCalendarExport,
  regenerateCalendarExport,
  removeCalendarExport,
  removeCalendarFeed,
  setCalendarFeedActive,
  setListingRef,
  syncAllCalendarFeeds,
  syncCalendarFeed,
} from "./actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { TONE_CLASS, exportHealth, feedHealth, type Health } from "@/lib/channel-health";

type FeedRow = {
  id: string;
  url: string;
  source: string;
  label: string | null;
  listing_ref: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  last_event_count: number | null;
  active: boolean;
  consecutive_failures: number;
  last_success_at: string | null;
  created_at: string;
  properties: { name: string; clients: { name: string; deactivated_at: string | null } | null } | null;
};

type RunRow = {
  feed_id: string;
  at: string;
  ok: boolean;
  added: number;
  updated: number;
  removed: number;
  clashes: number;
  error: string | null;
};

type ExportRow = {
  id: string;
  token: string;
  last_fetched_at: string | null;
  fetch_count: number;
  created_at: string;
  properties: { name: string; clients: { name: string } | null } | null;
};

function HealthChip({ health }: { health: Health }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${TONE_CLASS[health.tone]}`}>
      {health.label}
    </span>
  );
}

function runLine(r: RunRow): string {
  if (!r.ok) return r.error ?? "Failed";
  const parts = [
    r.added && `${r.added} new`,
    r.updated && `${r.updated} changed`,
    r.removed && `${r.removed} reopened`,
    r.clashes && `${r.clashes} clash${r.clashes === 1 ? "" : "es"}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

function ago(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

function syncedAgo(iso: string | null): string {
  return iso ? `synced ${ago(iso)}` : "never synced";
}

function exportUrl(token: string): string {
  return `${SUPABASE_URL}/functions/v1/ical/${token}`;
}

export default async function CalendarFeedsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const [{ data: properties }, { data: feeds }, { data: exports }, { data: runs }] = await Promise.all([
    supabase
      .from("properties_v")
      .select("id, name, clients:clients_v(name)")
      .eq("bookable", true)
      .order("name"),
    supabase
      .from("calendar_feeds")
      .select("id, url, source, label, listing_ref, last_synced_at, last_error, last_event_count, active, consecutive_failures, last_success_at, created_at, properties:properties_v(name, clients:clients_v(name, deactivated_at))")
      .order("created_at", { ascending: false }),
    supabase
      .from("calendar_exports")
      .select("id, token, last_fetched_at, fetch_count, created_at, properties:properties_v(name, clients:clients_v(name))")
      .eq("active", true)
      .order("created_at", { ascending: false }),
    // Only runs that changed something or failed are stored, so this is short.
    supabase
      .from("calendar_sync_runs")
      .select("feed_id, at, ok, added, updated, removed, clashes, error")
      .order("at", { ascending: false })
      .limit(300),
  ]);

  const runsByFeed = new Map<string, RunRow[]>();
  for (const run of (runs ?? []) as RunRow[]) {
    const list = runsByFeed.get(run.feed_id) ?? [];
    if (list.length < 15) list.push(run);
    runsByFeed.set(run.feed_id, list);
  }

  const rows = (feeds ?? []) as unknown as FeedRow[];
  const exportRows = (exports ?? []) as unknown as ExportRow[];

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Channel calendars"
        back={{ href: "/admin/calendar", label: "Calendar" }}
        info={
          <p>
            Two one-way links, in opposite directions. Neither carries a guest name or a price —
            a calendar link is dates only — so an imported night arrives as a block and the real
            booking is still entered by hand.
          </p>
        }
      />

      {notice && <p className={noticeBanner}>{notice}</p>}
      {error && <p className={errorBanner}>{error}</p>}

      <h2 className="text-sm font-medium text-ink-secondary -mb-2">Bring their dates in</h2>

      <form action={addCalendarFeed} className="card p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="property_id" className={fieldLabel}>
            Property
          </label>
          <select id="property_id" name="property_id" required className={fieldInput}>
            {properties?.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.clients as unknown as { name: string } | null)?.name ?? "—"} · {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="source" className={fieldLabel}>
            Channel
          </label>
          <select id="source" name="source" defaultValue="airbnb" className={fieldInput}>
            {BOOKING_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="url" className={fieldLabel}>
            Calendar link (.ics)
          </label>
          <input
            id="url"
            name="url"
            type="url"
            required
            placeholder="https://www.airbnb.com/calendar/ical/12345678.ics?s=…"
            className={fieldInput}
          />
          <p className="text-xs text-ink-muted">
            In Airbnb: Calendar → Availability → Connect calendars → Export calendar.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="label" className={fieldLabel}>
            Label (optional)
          </label>
          <input id="label" name="label" placeholder="e.g. Airbnb listing — Studio A" className={fieldInput} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="listing_ref" className={fieldLabel}>
            Listing name on the channel (optional)
          </label>
          <input
            id="listing_ref"
            name="listing_ref"
            placeholder="e.g. Gulberg Heights Loft"
            className={fieldInput}
          />
          <p className="text-xs text-ink-muted">
            Only used by the{" "}
            <Link href="/admin/channel-inbox" className="text-hostello-gold hover:underline">
              channel inbox
            </Link>
            , to route this listing&apos;s reservation emails to this property. A distinctive
            fragment is enough — it is matched inside the channel&apos;s own title, which is
            usually longer marketing copy.
          </p>
        </div>

        <SubmitButton
          className={`mt-1 ${primaryButton}`}
          blocking
          busy="Reading the channel calendar…"
          note="Fetching the link and importing every date it holds."
        >
          Connect calendar
        </SubmitButton>
      </form>

      <div className="card p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-medium text-ink-secondary">Connected</h2>
          {rows.length > 0 && (
            <form action={syncAllCalendarFeeds}>
              <SubmitButton
                className={`${secondaryButton} inline-flex items-center gap-1.5`}
                blocking
                busy="Syncing every calendar…"
                note="Each channel is fetched in turn — this is the slow one."
              >
                <RefreshCw size={12} aria-hidden />
                Sync all
              </SubmitButton>
            </form>
          )}
        </div>

        {rows.length === 0 && (
          <p className="text-sm text-ink-muted">
            No calendars connected yet. Paste a link above to start importing dates.
          </p>
        )}

        {rows.length > 0 && (
          <ul className="flex flex-col gap-3">
            {rows.map((feed) => (
              <li
                key={feed.id}
                className="flex items-start justify-between gap-3 text-sm border-b border-border-hairline last:border-0 pb-3 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-ink-primary flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: sourceColor(feed.source) }}
                      aria-hidden
                    />
                    <span className="truncate">
                      {feed.properties?.clients?.name ?? "—"} · {feed.properties?.name ?? "—"}
                    </span>
                  </p>
                  <div className="mt-1">
                    <HealthChip
                      health={feedHealth({
                        ...feed,
                        clientDeactivated: Boolean(feed.properties?.clients?.deactivated_at),
                      })}
                    />
                  </div>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {feed.label ?? sourceLabel(feed.source) ?? "External calendar"} — {syncedAgo(feed.last_synced_at)}
                    {feed.last_event_count !== null && `, ${feed.last_event_count} dates held`}
                  </p>
                  <form action={setListingRef} className="flex items-center gap-1.5 mt-1.5">
                    <input type="hidden" name="id" value={feed.id} />
                    <input
                      name="listing_ref"
                      defaultValue={feed.listing_ref ?? ""}
                      placeholder="Listing name for reservation emails"
                      className={`${fieldInput} text-xs py-1 flex-1 min-w-0`}
                    />
                    <SubmitButton className={secondaryButton} busy="Saving the listing name…">
                      Save
                    </SubmitButton>
                  </form>
                  {feed.last_error && (
                    <p className="text-xs text-status-booked mt-1">{feed.last_error}</p>
                  )}
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-xs font-bold text-hostello-purple-light">
                      History
                    </summary>
                    {(runsByFeed.get(feed.id) ?? []).length === 0 ? (
                      <p className="text-xs text-ink-muted mt-1.5">
                        Nothing has changed or failed yet. Quiet syncs are not listed.
                      </p>
                    ) : (
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {(runsByFeed.get(feed.id) ?? []).map((run) => (
                          <li key={run.at} className="text-xs flex gap-2">
                            <span className="text-ink-muted shrink-0 tabular-nums">{ago(run.at)}</span>
                            <span className={run.ok ? "text-ink-secondary" : "text-status-booked"}>
                              {runLine(run)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <form action={setCalendarFeedActive}>
                    <input type="hidden" name="id" value={feed.id} />
                    <input type="hidden" name="active" value={feed.active ? "false" : "true"} />
                    <SubmitButton
                      className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
                      busy={feed.active ? "Pausing…" : "Resuming…"}
                    >
                      {feed.active ? "Pause" : "Resume"}
                    </SubmitButton>
                  </form>
                  {feed.active && (
                    <form action={syncCalendarFeed}>
                      <input type="hidden" name="id" value={feed.id} />
                      <SubmitButton
                        className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
                        blocking
                        busy="Syncing this calendar…"
                        note="Fetching the channel's link and updating the dates it holds."
                      >
                        Sync now
                      </SubmitButton>
                    </form>
                  )}
                  <form action={removeCalendarFeed}>
                    <input type="hidden" name="id" value={feed.id} />
                    <ConfirmDeleteButton
                      confirmText="Disconnect this calendar? The dates it imported will be removed."
                      label="Disconnect"
                      busy="Disconnecting the calendar…"
                      className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                    />
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="text-sm font-medium text-ink-secondary -mb-2">Send our dates out</h2>

      <div className="card p-6 flex flex-col gap-4">
        <p className="text-xs text-ink-muted">
          Publish a property&apos;s booked and blocked nights as a link, then paste it into the
          channel so it closes those dates too. The channel decides when to re-read it —
          Airbnb is usually about every 2 hours, and that cannot be hurried. Anyone holding
          the link can see the dates, so treat it as a password.
        </p>

        <form action={createCalendarExport} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <label htmlFor="export_property_id" className={fieldLabel}>
              Property
            </label>
            <select id="export_property_id" name="property_id" required className={fieldInput}>
              {properties?.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.clients as unknown as { name: string } | null)?.name ?? "—"} · {p.name}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton className={`${primaryButton} shrink-0`} busy="Creating the link…">
            Create link
          </SubmitButton>
        </form>

        {exportRows.length === 0 && (
          <p className="text-sm text-ink-muted">No links published yet.</p>
        )}

        {exportRows.length > 0 && (
          <ul className="flex flex-col gap-3">
            {exportRows.map((row) => {
              const url = exportUrl(row.token);
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-1.5 text-sm border-b border-border-hairline last:border-0 pb-3 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-ink-primary truncate">
                      {row.properties?.clients?.name ?? "—"} · {row.properties?.name ?? "—"}
                    </p>
                    <div className="flex items-center gap-3 shrink-0">
                      <CopyLinkButton
                        value={url}
                        className="text-xs text-ink-muted hover:text-ink-primary inline-flex items-center gap-1 transition-colors"
                      />
                      <form action={regenerateCalendarExport}>
                        <input type="hidden" name="id" value={row.id} />
                        <ConfirmDeleteButton
                          confirmText="Issue a new link? The current one stops working immediately, and you will have to paste the new one into every channel using it."
                          label="New link"
                          busy="Issuing a new link…"
                          className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
                        />
                      </form>
                      <form action={removeCalendarExport}>
                        <input type="hidden" name="id" value={row.id} />
                        <ConfirmDeleteButton
                          confirmText="Delete this link? Any channel pointed at it will stop receiving updates."
                          label="Delete"
                          busy="Deleting the link…"
                          className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                        />
                      </form>
                    </div>
                  </div>

                  <code className="text-xs text-ink-muted break-all bg-surface-2 rounded px-2 py-1.5">
                    {url}
                  </code>

                  <HealthChip health={exportHealth(row)} />
                  <p className="text-xs text-ink-muted">
                    {row.last_fetched_at
                      ? `Last read by a channel ${ago(row.last_fetched_at)} · ${row.fetch_count} reads`
                      : "Not read by a channel yet — it can take a couple of hours after you paste it in."}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
