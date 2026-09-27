import { redirect } from "next/navigation";
import { currentClient, currentUser } from "@/lib/auth";
import { isCategory } from "@/lib/notifications";
import {
  readNotificationPreferences,
  readNotifications,
  unreadNotificationCount,
} from "@/lib/notification-feed";
import { MarkAllReadButton, NotificationFeed } from "@/components/shared/NotificationFeed";
import { NotificationSettings } from "@/components/shared/NotificationSettings";
import { PageHeader } from "@/components/shared/PageHeader";

export default async function ClientNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const unreadOnly = sp.filter === "unread";
  const category = isCategory(sp.category) ? sp.category : undefined;

  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const [items, unreadCount, preferences] = await Promise.all([
    readNotifications(user.id, { limit: 100, unreadOnly, category, portal: "client" }),
    unreadNotificationCount(user.id),
    readNotificationPreferences(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Alerts" actions={<MarkAllReadButton unreadCount={unreadCount} />} />

      <NotificationFeed
        items={items}
        unreadCount={unreadCount}
        basePath="/client/notifications"
        unreadOnly={unreadOnly}
        category={category}
      />

      <NotificationSettings preferences={preferences} />
    </div>
  );
}
