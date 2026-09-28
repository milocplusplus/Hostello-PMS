import {
  BadgeCheck,
  BadgeX,
  Bell,
  CalendarClock,
  CalendarCog,
  CalendarDays,
  CalendarPlus,
  CalendarX2,
  HandCoins,
  History,
  Home,
  Inbox,
  Lock,
  LockOpen,
  LogIn,
  LogOut,
  PencilRuler,
  Percent,
  Receipt,
  ReceiptText,
  ShieldAlert,
  Sun,
  Target,
  TrendingUp,
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
  // The day-before reminder, so there is a day to act in. A clock rather than
  // the arrival arrow the two below use: nobody is coming through a door yet.
  booking_checkin_tomorrow: CalendarClock,
  booking_checkin_today: LogIn,
  booking_checkout_today: LogOut,
  guest_checked_in: LogIn,
  guest_checked_out: LogOut,
  payment_received: Receipt,
  // Owner → Hostello: they file it, an admin rules on it.
  payout_submitted: HandCoins,
  payout_confirmed: BadgeCheck,
  payout_rejected: BadgeX,
  share_received: Wallet,
  // Hostello → owner: Hostello sends it, the owner rules on it.
  payout_sent: Wallet,
  payout_receipt_confirmed: BadgeCheck,
  payout_receipt_rejected: BadgeX,
  payout_receipt_recorded: BadgeCheck,
  // A channel emailed us about a reservation. Admin-only, every one of them:
  // until an admin approves it nothing has happened, so there is nothing to
  // tell an owner. Their notice is the ordinary `booking_created` on approval.
  ota_reservation_received: Inbox,
  ota_reservation_cancelled: CalendarX2,
  ota_reservation_changed: CalendarCog,
  ota_payout_reported: Wallet,
  ota_email_unmatched: TriangleAlert,
  dates_blocked: Lock,
  dates_unblocked: LockOpen,
  calendar_conflict: TriangleAlert,
  // A channel's iCal sold nights and sent dates only. Written by the sync in
  // SQL (`sync_calendar_feed_apply`), not by notify.ts, and the only kind that
  // goes to ops as well as admin — it is a stay to write up, not a figure.
  channel_reservation: CalendarPlus,
  // Channel sync health (record_sync_run / check_channel_health, in SQL).
  // Staff-wide: no money in them, and ops is who fixes a calendar link.
  channel_sync_failing: TriangleAlert,
  channel_sync_stopped: TriangleAlert,
  channel_export_unread: TriangleAlert,
  channel_sync_recovered: BadgeCheck,
  // A flat in a shared Booking.com room type was filled or freed some other
  // way; staff move Booking.com's count by hand (trigger, in SQL).
  booking_com_count: CalendarCog,
  // The channel's calendar moved or dropped a stay that is booked here, or has
  // a stay no email explained (triggers + check_channel_health, in SQL).
  channel_stay_moved: CalendarCog,
  channel_stay_dropped: CalendarX2,
  ota_hold_unexplained: TriangleAlert,
  property_added: Home,
  property_removed: Home,
  // An owner asking for a capacity or an asking price to change, and the
  // admin's answer. The ask is admin-only — ops has no policy to write
  // `properties`, so it could not clear the queue.
  property_change_requested: PencilRuler,
  property_change_applied: BadgeCheck,
  property_change_declined: BadgeX,
  client_terms_updated: Percent,
  // An owner's recurring bill came due (generate_due_expenses, in SQL). Owner
  // only: it is their own books, and nothing in it is Hostello's to act on.
  expense_due: ReceiptText,
  // Both from notify_expense_alerts(), in SQL. Owner only, for the same reason.
  expense_budget_crossed: Target,
  expense_running_high: TrendingUp,
  // The owner's 07:15 summary (notify_owner_digest, in SQL). It replaces the
  // per-stay notices above for the owner; those now go to the admin only.
  daily_digest: Sun,
  // Mondays, from notify_payment_reminders() in SQL: what the owner owes Hostello.
  payment_reminder: HandCoins,
  // Written by the audit log itself (audit_alert(), in SQL). Admin only.
  audit_staff_price: History,
  audit_staff_cancelled: CalendarX2,
  audit_deleted: History,
  audit_sign_in_failed: ShieldAlert,
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

/** The `payout_*` kinds that belong to the Hostello → owner direction. */
const TO_CLIENT_KINDS = new Set([
  "payout_sent",
  "payout_receipt_confirmed",
  "payout_receipt_rejected",
  "payout_receipt_recorded",
]);

export function notificationHref(
  row: { kind?: string | null; booking_id?: string | null; property_id?: string | null },
  portal: "admin" | "client"
): string {
  // A payment entry can clear several bookings at once, so it has neither id to
  // follow — it belongs to a direction, which is a tab.
  if (row.kind?.startsWith("payout_")) {
    const tab = TO_CLIENT_KINDS.has(row.kind) ? "to-client" : "to-hostello";
    return `${portal === "admin" ? "/admin" : "/client"}/settlements?tab=${tab}`;
  }
  // A channel email is a thing to review, not a booking to look at — even when
  // it has already found the booking it is about.
  if (row.kind?.startsWith("ota_")) return "/admin/channel-inbox";

  // A change request is a queue on one side and a status on the other. Neither
  // is the property's calendar, which is where a bare property_id would land.
  if (row.kind?.startsWith("property_change_")) {
    return portal === "admin" ? "/admin/property-requests" : "/client/properties";
  }

  // A staff edit or cancel is about a booking and lands on it (below); a
  // deletion has nothing left to open, and a sign-in has no record at all.
  if (row.kind === "audit_sign_in_failed") return "/admin/audit?type=signin";
  // Sync health is about a link, and the links page is where it is fixed.
  if (row.kind?.startsWith("channel_sync_") || row.kind === "channel_export_unread") {
    return portal === "admin" ? "/admin/calendar/feeds" : "/client/calendar";
  }
  if (row.kind === "audit_deleted") return "/admin/audit";

  // The reminder is paid from the Money screen, on the owed-to-Hostello tab.
  if (row.kind === "payment_reminder") {
    return portal === "admin" ? "/admin/settlements?tab=to-hostello" : "/client/settlements?tab=to-hostello";
  }

  // The morning summary is the day sheet in one line; the day sheet is where it goes.
  if (row.kind === "daily_digest") return portal === "admin" ? "/admin/today" : "/client/today";

  // A due bill is confirmed from the Expenses page, whatever month it is from.
  // A crossed budget is looked at, and changed, on Budgets; a category running
  // high is best seen on the Profit tab, next to the months before it.
  if (row.kind?.startsWith("expense_")) {
    if (portal === "admin") return "/admin/notifications";
    if (row.kind === "expense_budget_crossed") return "/client/expenses/budgets";
    if (row.kind === "expense_running_high") return "/client/expenses?view=profit";
    return "/client/expenses";
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
