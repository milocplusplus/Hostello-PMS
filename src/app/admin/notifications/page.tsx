import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isCategory } from "@/lib/notifications";
import {
  readNotificationPreferences,
  readNotifications,
  unreadNotificationCount,
} from "@/lib/notification-feed";
import { MarkAllReadButton, NotificationFeed } from "@/components/shared/NotificationFeed";
import { NotificationSettings } from "@/components/shared/NotificationSettings";

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const unreadOnly = sp.filter === "unread";
  const category = isCategory(sp.category) ? sp.category : undefined;

  const user = await currentUser();
  if (!user) redirect("/login");

  const [items, unreadCount, preferences] = await Promise.all([
    readNotifications(user.id, { limit: 100, unreadOnly, category, portal: "admin" }),
    unreadNotificationCount(user.id),
    readNotificationPreferences(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-ink-muted text-xs tracking-wide">OVERVIEW</p>
          <h1 className="text-2xl font-semibold mt-1">Activity</h1>
          <p className="text-sm text-ink-secondary mt-1.5">
            Every booking, payment, block and clash across the portfolio.
          </p>
        </div>
        <MarkAllReadButton unreadCount={unreadCount} />
      </div>

      <NotificationFeed
        items={items}
        unreadCount={unreadCount}
        basePath="/admin/notifications"
        unreadOnly={unreadOnly}
        category={category}
      />

      <NotificationSettings preferences={preferences} />
    </div>
  );
}
