/**
 * How a channel link is doing, in one word and a colour. The same thresholds
 * the alerts use (`record_sync_run` / `check_channel_health` in SQL): five
 * failures in a row is failing, half an hour without a successful sync is
 * quiet, a day without a channel reading our export is not being read.
 */

export type HealthTone = "ok" | "warn" | "bad" | "off";

export type Health = { tone: HealthTone; label: string };

export const FAILING_AFTER = 5;
const QUIET_MS = 30 * 60_000;
const UNREAD_MS = 24 * 3_600_000;

export function feedHealth(f: {
  active: boolean;
  consecutive_failures: number;
  last_success_at: string | null;
  created_at: string;
  clientDeactivated: boolean;
}): Health {
  if (f.clientDeactivated) return { tone: "off", label: "Paused · client deactivated" };
  if (!f.active) return { tone: "off", label: "Paused" };
  if (f.consecutive_failures >= FAILING_AFTER) {
    return { tone: "bad", label: `Failing · ${f.consecutive_failures} in a row` };
  }
  if (f.consecutive_failures > 0) {
    return { tone: "warn", label: `${f.consecutive_failures} failed attempt${f.consecutive_failures === 1 ? "" : "s"}` };
  }
  const since = new Date(f.last_success_at ?? f.created_at).getTime();
  if (Date.now() - since > QUIET_MS) return { tone: "warn", label: "No recent sync" };
  return { tone: "ok", label: "Healthy" };
}

export function exportHealth(e: { last_fetched_at: string | null; created_at: string }): Health {
  const since = new Date(e.last_fetched_at ?? e.created_at).getTime();
  if (Date.now() - since > UNREAD_MS) {
    return { tone: "bad", label: e.last_fetched_at ? "Not read for over a day" : "Never read" };
  }
  return e.last_fetched_at ? { tone: "ok", label: "Being read" } : { tone: "warn", label: "Waiting for first read" };
}

export const TONE_CLASS: Record<HealthTone, string> = {
  ok: "text-status-available border-status-available/40 bg-status-available/10",
  warn: "text-status-pending border-status-pending/40 bg-status-pending/10",
  bad: "text-status-booked border-status-booked/40 bg-status-booked/10",
  off: "text-ink-muted border-white/15 bg-white/5",
};
