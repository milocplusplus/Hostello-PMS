import { redirect } from "next/navigation";
import { currentProfile, currentUser, isStaffRole } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { AdminShell } from "@/components/admin/AdminShell";
import { NotificationLive } from "@/components/shared/NotificationLive";
import { searchAdmin } from "@/app/admin/search/actions";
import { markAllNotificationsRead } from "@/app/notifications/actions";
import {
  readNotificationPreferences,
  readNotifications,
  unreadNotificationCount,
} from "@/lib/notification-feed";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  // The bell reads this admin's own recipient rows — every admin has their own
  // read state now. None of these four depend on each other, so they go out
  // together rather than in a chain.
  const [profile, notifications, unreadCount, preferences] = await Promise.all([
    currentProfile(),
    readNotifications(user.id, { limit: 8, portal: "admin" }),
    unreadNotificationCount(user.id),
    readNotificationPreferences(user.id),
  ]);

  if (!profile || !isStaffRole(profile.role)) redirect("/client");
  const role = profile.role;

  return (
    <>
      <AdminShell
        role={role}
        userName={profile.full_name ?? (role === "ops" ? "Operations" : "Owner")}
        logoutAction={logout}
        searchAction={searchAdmin}
        notifications={notifications}
        unreadCount={unreadCount}
        markAllReadAction={markAllNotificationsRead}
      >
        {children}
      </AdminShell>
      {/* Events fan out to owners only, so there is nothing for an ops session
          to listen for. */}
      {role === "admin" && (
        <NotificationLive
          userId={user.id}
          portal="admin"
          soundEnabled={preferences.soundEnabled}
          mutedCategories={preferences.mutedCategories}
        />
      )}
    </>
  );
}
