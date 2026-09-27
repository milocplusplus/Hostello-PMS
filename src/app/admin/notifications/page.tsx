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
import { PageHeader } from "@/components/shared/PageHeader";

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
      <PageHeader title="Activity" actions={<MarkAllReadButton unreadCount={unreadCount} />} />

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
