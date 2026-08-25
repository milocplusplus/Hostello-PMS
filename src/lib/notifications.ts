import {
  Bell,
  CalendarDays,
  CalendarX2,
  Lock,
  LockOpen,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** One row of the feed, already shaped for display. */
export type NotificationItem = {
  id: string;
  kind: string;
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

const KIND_ICON: Record<string, LucideIcon> = {
  booking_created: CalendarDays,
  booking_cancelled: CalendarX2,
  dates_blocked: Lock,
  dates_unblocked: LockOpen,
  payout_settled: Wallet,
};

export function notificationIcon(kind: string): LucideIcon {
  return KIND_ICON[kind] ?? Bell;
}

export function notificationHref(
  row: { booking_id?: string | null; property_id?: string | null },
  portal: "admin" | "client"
): string {
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
