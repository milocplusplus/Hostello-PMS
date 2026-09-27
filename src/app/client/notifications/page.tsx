import { redirect } from "next/navigation";
import { currentClient, currentUser, portalUserId } from "@/lib/auth";
import { DEFAULT_PREFERENCES, isCategory } from "@/lib/notifications";
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

  // While viewing as an owner, their alerts; an owner with no login has none.
  const feedUser = await portalUserId();
  const [items, unreadCount, preferences] = feedUser
    ? await Promise.all([
        readNotifications(feedUser, { limit: 100, unreadOnly, category, portal: "client" }),
        unreadNotificationCount(feedUser),
        readNotificationPreferences(feedUser),
      ])
    : [[], 0, DEFAULT_PREFERENCES];

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
