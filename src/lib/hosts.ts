import { addDaysISO, todayISO } from "./calendar";
import type { Health } from "./channel-health";

export const SUBSCRIPTION_STATUSES = ["trial", "active", "read_only", "paused"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PAYMENT_METHODS = [
  { value: "bank", label: "Bank transfer" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
] as const;

export type HostSubscription = {
  plan_key: string;
  billing_period: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  comped: boolean;
  note: string | null;
};

/** Whole days from today to a timestamp's date, never below zero. */
export function daysUntil(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso.slice(0, 10)) - Date.parse(todayISO());
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** A host's standing in one word and a colour, the way channel links are shown. */
export function subscriptionHealth(s: HostSubscription | null): Health {
  if (!s) return { tone: "off", label: "No plan" };
  if (s.comped && s.status !== "paused") return { tone: "ok", label: "Comped" };
  switch (s.status) {
    case "trial": {
      const days = daysUntil(s.trial_ends_at);
      return { tone: days <= 3 ? "warn" : "ok", label: `Trial · ${days}d left` };
    }
    case "active":
      return { tone: "ok", label: "Paid" };
    case "read_only":
      return { tone: "bad", label: "Lapsed · read-only" };
    case "paused":
      return { tone: "off", label: "Paused" };
  }
}

/** The new trial end for "extend by N days": from the later of today and the current end. */
export function extendedTrialEnd(current: string | null, days: number): string {
  const today = todayISO();
  const from = current && current.slice(0, 10) > today ? current.slice(0, 10) : today;
  return addDaysISO(from, days);
}
