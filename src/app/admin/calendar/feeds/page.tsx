import Link from "next/link";
import { redirect } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { CopyLinkButton } from "@/components/admin/CopyLinkButton";
import { BOOKING_SOURCES, sourceColor, sourceLabel } from "@/lib/block-sources";
import { SUPABASE_URL } from "@/lib/supabase/config";
import {
  fieldLabel,
  fieldInput,
  primaryButton,
  primaryButtonStyle,
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
  syncAllCalendarFeeds,
  syncCalendarFeed,
} from "./actions";

type FeedRow = {
  id: string;
  url: string;
  source: string;
  label: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  last_event_count: number | null;
  properties: { name: string; clients: { name: string } | null } | null;
};

type ExportRow = {
  id: string;
  token: string;
  last_fetched_at: string | null;
  fetch_count: number;
  properties: { name: string; clients: { name: string } | null } | null;
};

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

  const [{ data: properties }, { data: feeds }, { data: exports }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, clients(name)")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("calendar_feeds")
      .select("id, url, source, label, last_synced_at, last_error, last_event_count, properties(name, clients(name))")
      .order("created_at", { ascending: false }),
    supabase
      .from("calendar_exports")
      .select("id, token, last_fetched_at, fetch_count, properties(name, clients(name))")
      .eq("active", true)
      .order("created_at", { ascending: false }),
  ]);

  const rows = (feeds ?? []) as unknown as FeedRow[];
  const exportRows = (exports ?? []) as unknown as ExportRow[];

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <Link href="/admin/calendar" className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Calendar
        </Link>
        <h1 className="text-xl font-medium mt-1">Channel calendars</h1>
        <p className="text-sm text-ink-secondary mt-1">
          Two one-way links, in opposite directions. Neither carries a guest name or a price —
          a calendar link is dates only — so an imported night arrives as a block and the real
          booking is still entered by hand.
        </p>
      </div>

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

        <button type="submit" className={`mt-1 ${primaryButton}`} style={primaryButtonStyle}>
          Connect calendar
        </button>
      </form>

      <div className="card p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-medium text-ink-secondary">Connected</h2>
          {rows.length > 0 && (
            <form action={syncAllCalendarFeeds}>
              <button type="submit" className={`${secondaryButton} inline-flex items-center gap-1.5`}>
                <RefreshCw size={12} aria-hidden />
                Sync all
              </button>
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
                  <p className="text-xs text-ink-muted mt-0.5">
                    {feed.label ?? sourceLabel(feed.source) ?? "External calendar"} — {syncedAgo(feed.last_synced_at)}
                    {feed.last_event_count !== null && `, ${feed.last_event_count} dates held`}
                  </p>
                  {feed.last_error && (
                    <p className="text-xs text-status-booked mt-1">{feed.last_error}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <form action={syncCalendarFeed}>
                    <input type="hidden" name="id" value={feed.id} />
                    <button
                      type="submit"
                      className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
                    >
                      Sync now
                    </button>
                  </form>
                  <form action={removeCalendarFeed}>
                    <input type="hidden" name="id" value={feed.id} />
                    <ConfirmDeleteButton
                      confirmText="Disconnect this calendar? The dates it imported will be removed."
                      label="Disconnect"
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
          <button type="submit" className={`${primaryButton} shrink-0`} style={primaryButtonStyle}>
            Create link
          </button>
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
                          className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
                        />
                      </form>
                      <form action={removeCalendarExport}>
                        <input type="hidden" name="id" value={row.id} />
                        <ConfirmDeleteButton
                          confirmText="Delete this link? Any channel pointed at it will stop receiving updates."
                          label="Delete"
                          className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                        />
                      </form>
                    </div>
                  </div>

                  <code className="text-xs text-ink-muted break-all bg-surface-2 rounded px-2 py-1.5">
                    {url}
                  </code>

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
