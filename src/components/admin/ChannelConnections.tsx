import Link from "next/link";
import { ChevronRight, Plus, RefreshCw } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { HealthChip } from "@/components/admin/HealthChip";
import { SubmitButton } from "@/components/shared/Busy";
import { sourceColor, sourceLabel } from "@/lib/block-sources";
import { ago, feedHealth, type Health } from "@/lib/channel-health";
import { fieldInput, secondaryButton } from "@/lib/form-styles";
import {
  removeCalendarFeed,
  setCalendarFeedActive,
  setListingRef,
  syncCalendarFeed,
} from "@/app/admin/calendar/feeds/actions";

export type ConnectionFeed = {
  id: string;
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
};

export type ConnectionRun = {
  feed_id: string;
  at: string;
  ok: boolean;
  added: number;
  updated: number;
  removed: number;
  clashes: number;
  error: string | null;
};

export type ConnectionUnit = { id: string; name: string; feeds: ConnectionFeed[] };

export type ConnectionClient = { name: string; deactivated: boolean; units: ConnectionUnit[] };

const NOT_CONNECTED: Health = { tone: "off", label: "Not connected" };

function runLine(r: ConnectionRun): string {
  if (!r.ok) return r.error ?? "Failed";
  const parts = [
    r.added && `${r.added} new`,
    r.updated && `${r.updated} changed`,
    r.removed && `${r.removed} reopened`,
    r.clashes && `${r.clashes} clash${r.clashes === 1 ? "" : "es"}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * Every unit and the channel calendars it reads from, a client at a time. A
 * unit with no Airbnb link says so and offers to connect one: a missing link
 * is the thing this page exists to make visible.
 */
export function ChannelConnections({
  clients,
  runs,
}: {
  clients: ConnectionClient[];
  runs: Map<string, ConnectionRun[]>;
}) {
  return (
    <>
      {clients.map((client) => (
        <section key={client.name} className="card overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-border-hairline flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-ink-primary truncate">{client.name}</h2>
            <span className="num text-xs text-ink-muted">
              {client.units.length} {client.units.length === 1 ? "unit" : "units"}
            </span>
          </div>
          <ul className="divide-y divide-[var(--color-border-hairline)]">
            {client.units.map((unit) => {
              const airbnb = unit.feeds.some((f) => f.source === "airbnb");
              return (
                <li key={unit.id} className="px-4 md:px-5 py-3 flex flex-col gap-3">
                  {unit.feeds.map((feed) => {
                    const history = runs.get(feed.id) ?? [];
                    return (
                      <div key={feed.id} className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <div className="min-w-0 flex-1 basis-44">
                            <p className="text-sm text-ink-primary flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">{unit.name}</span>
                              <HealthChip health={feedHealth({ ...feed, clientDeactivated: client.deactivated })} />
                            </p>
                            <p className="text-xs text-ink-secondary mt-1 flex items-center gap-1.5">
                              <span
                                className="size-2 rounded-full shrink-0"
                                style={{ backgroundColor: sourceColor(feed.source) }}
                                aria-hidden
                              />
                              <span className="truncate">
                                {feed.label ?? sourceLabel(feed.source) ?? "External calendar"} ·{" "}
                                {feed.last_synced_at ? `synced ${ago(feed.last_synced_at)}` : "never synced"}
                                {feed.last_event_count !== null && ` · ${feed.last_event_count} dates held`}
                              </span>
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            {feed.active && (
                              <form action={syncCalendarFeed}>
                                <input type="hidden" name="id" value={feed.id} />
                                <SubmitButton
                                  className="btn btn-ghost btn-sm"
                                  blocking
                                  busy="Syncing this calendar…"
                                  note="Fetching the channel's link and updating the dates it holds."
                                >
                                  <RefreshCw size={13} aria-hidden />
                                  Sync now
                                </SubmitButton>
                              </form>
                            )}
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
                        </div>
                        {feed.last_error && <p className="text-xs text-status-booked">{feed.last_error}</p>}
                        <details className="group">
                          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-ink-secondary w-fit">
                            <ChevronRight size={13} className="transition-transform group-open:rotate-90" aria-hidden />
                            History
                          </summary>
                          {history.length === 0 ? (
                            <p className="text-xs text-ink-muted mt-2">
                              Nothing has changed or failed yet. Quiet syncs are not listed.
                            </p>
                          ) : (
                            <ul className="mt-2 flex flex-col gap-1">
                              {history.map((run) => (
                                <li key={run.at} className="text-xs flex gap-2">
                                  <span className="text-ink-muted shrink-0 tabular-nums">{ago(run.at)}</span>
                                  <span className={run.ok ? "text-ink-secondary" : "text-status-booked"}>
                                    {runLine(run)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {/* Only the channel inbox reads this, so it stays folded away with the history. */}
                          <form action={setListingRef} className="flex items-center gap-1.5 mt-3 max-w-md">
                            <input type="hidden" name="id" value={feed.id} />
                            <input
                              name="listing_ref"
                              defaultValue={feed.listing_ref ?? ""}
                              placeholder="Listing name for reservation emails"
                              aria-label="Listing name for reservation emails"
                              className={`${fieldInput} text-xs py-1 flex-1 min-w-0`}
                            />
                            <SubmitButton className={secondaryButton} busy="Saving the listing name…">
                              Save
                            </SubmitButton>
                          </form>
                        </details>
                      </div>
                    );
                  })}

                  {!airbnb && (
                    <div className="flex items-center gap-3">
                      <p className="min-w-0 flex-1 text-sm text-ink-primary flex items-center gap-2 flex-wrap">
                        <span className={unit.feeds.length === 0 ? "font-semibold" : "text-xs text-ink-secondary"}>
                          {unit.feeds.length === 0 ? unit.name : "Airbnb"}
                        </span>
                        <HealthChip health={NOT_CONNECTED} />
                      </p>
                      {!client.deactivated && (
                        <Link
                          href={`/admin/calendar/feeds/connect?property=${unit.id}`}
                          className="btn btn-ghost btn-sm shrink-0"
                        >
                          <Plus size={13} aria-hidden />
                          Connect
                        </Link>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
