import {
  BadgeCheck,
  BadgeX,
  Bell,
  CalendarCog,
  CalendarDays,
  CalendarX2,
  HandCoins,
  Home,
  Lock,
  LockOpen,
  LogIn,
  LogOut,
  Percent,
  Receipt,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * The vocabulary of the notification system.
 *
 * `kind` says exactly what happened and picks the icon; `category` groups kinds
 * for the filters, the mute switches and the sound. Both are plain strings in
 * the database (`kind` used to be an enum, which meant a migration for every new
 * event), so adding an event is: one entry here, one emitter in `notify.ts`.
 */
export type NotificationCategory = "booking" | "payment" | "calendar" | "system" | "critical";

export const CATEGORIES: { key: NotificationCategory; label: string }[] = [
  { key: "booking", label: "Bookings" },
  { key: "payment", label: "Payments" },
  { key: "calendar", label: "Calendar" },
  { key: "critical", label: "Critical" },
  { key: "system", label: "Account" },
];

export function isCategory(value: string | undefined): value is NotificationCategory {
  return CATEGORIES.some((c) => c.key === value);
}

const KIND_ICON: Record<string, LucideIcon> = {
  booking_created: CalendarDays,
  booking_updated: CalendarCog,
  booking_cancelled: CalendarX2,
  booking_checkin_today: LogIn,
  booking_checkout_today: LogOut,
  guest_checked_in: LogIn,
  guest_checked_out: LogOut,
  payment_received: Receipt,
  payout_settled: Wallet,
  payout_submitted: HandCoins,
  payout_confirmed: BadgeCheck,
  payout_rejected: BadgeX,
  share_received: Wallet,
  dates_blocked: Lock,
  dates_unblocked: LockOpen,
  calendar_conflict: TriangleAlert,
  property_added: Home,
  property_removed: Home,
  client_terms_updated: Percent,
};

export function notificationIcon(kind: string): LucideIcon {
  return KIND_ICON[kind] ?? Bell;
}

/** One row of the feed, already shaped for display. */
export type NotificationItem = {
  id: string;
  kind: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  /** Pre-formatted on the server — a client component computing "2h ago" would
   *  render a different string than the SSR pass and trip hydration. */
  when: string;
  unread: boolean;
  href: string;
  /** Which client the row is about. Admin feed only; the client portal knows. */
  who?: string | null;
};

export function notificationHref(
  row: { kind?: string | null; booking_id?: string | null; property_id?: string | null },
  portal: "admin" | "client"
): string {
  // A payment entry is not about one booking, so it has neither id to follow.
  if (row.kind?.startsWith("payout_")) {
    return portal === "admin" ? "/admin/payouts" : "/client/payouts";
  }
  if (portal === "admin") {
    if (row.booking_id) return `/admin/bookings/${row.booking_id}`;
    if (row.property_id) return `/admin/calendar?property=${row.property_id}`;
    return "/admin/notifications";
  }
  if (row.booking_id) return `/client/bookings/${row.booking_id}`;
  if (row.property_id) return "/client/calendar";
  return "/client/notifications";
}

/** Relative for the first day, then an absolute Karachi timestamp. */
export function formatNotificationTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  });
}

/** What the browser stores per user; the server hands it to the live listener. */
export type NotificationPreferences = {
  pushEnabled: boolean;
  soundEnabled: boolean;
  mutedCategories: NotificationCategory[];
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  soundEnabled: true,
  mutedCategories: [],
};
