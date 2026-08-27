import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PREFERENCES,
  formatNotificationTime,
  notificationHref,
  type NotificationCategory,
  type NotificationItem,
  type NotificationPreferences,
} from "@/lib/notifications";

/**
 * Reading the feed. Both portals and both bells go through here, so "what this
 * user is allowed to see" is expressed once: the recipient row *is* the
 * permission, and the join hangs the event off it.
 */

type FeedQuery = {
  limit?: number;
  unreadOnly?: boolean;
  category?: NotificationCategory;
  portal: "admin" | "client";
};

type JoinedRow = {
  read_at: string | null;
  created_at: string;
  notifications: {
    id: string;
    kind: string;
    category: NotificationCategory;
    title: string;
    body: string | null;
    booking_id: string | null;
    property_id: string | null;
    clients: { name: string } | null;
  } | null;
};

export async function readNotifications(
  userId: string,
  { limit = 50, unreadOnly = false, category, portal }: FeedQuery
): Promise<NotificationItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("notification_recipients")
    .select(
      "read_at, created_at, notifications!inner(id, kind, category, title, body, booking_id, property_id, clients(name))"
    )
    .eq("user_id", userId)
    // The recipient row carries its own timestamp precisely so the list can be
    // ordered and paged without reaching into the joined table.
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.is("read_at", null);
  if (category) query = query.eq("notifications.category", category);

  const { data } = await query;

  return ((data ?? []) as unknown as JoinedRow[])
    .filter((row) => row.notifications !== null)
    .map((row) => {
      const n = row.notifications!;
      return {
        id: n.id,
        kind: n.kind,
        category: n.category,
        title: n.title,
        body: n.body,
        when: formatNotificationTime(row.created_at),
        unread: !row.read_at,
        href: notificationHref(n, portal),
        who: portal === "admin" ? (n.clients?.name ?? null) : null,
      };
    });
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notification_recipients")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

export async function readNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select("push_enabled, sound_enabled, muted_categories")
    .eq("user_id", userId)
    .maybeSingle();

  // No row yet means the defaults, not "everything off".
  if (!data) return DEFAULT_PREFERENCES;

  return {
    pushEnabled: data.push_enabled,
    soundEnabled: data.sound_enabled,
    mutedCategories: (data.muted_categories ?? []) as NotificationCategory[],
  };
}
