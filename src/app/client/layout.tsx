import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentClient, currentProfile, currentUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { ClientShell } from "@/components/client/ClientShell";
import { NavProgress } from "@/components/shared/NavProgress";
import { SubmitButton } from "@/components/shared/Busy";
import { NotificationLive } from "@/components/shared/NotificationLive";
import { searchClient } from "@/app/client/search/actions";
import { markAllNotificationsRead } from "@/app/notifications/actions";
import {
  readNotificationPreferences,
  readNotifications,
  unreadNotificationCount,
} from "@/lib/notification-feed";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  // Independent of each other — one round trip instead of two.
  const [profile, clientRecord] = await Promise.all([currentProfile(), currentClient()]);

  if (profile?.role === "admin") redirect("/admin");

  if (!clientRecord) {
    // Signed-in client user with no linked client record yet — nothing to show.
    return (
      <div className="min-h-screen bg-surface-0 text-ink-primary flex items-center justify-center px-6">
        <div className="card p-8 max-w-sm text-center">
          <p className="text-sm text-ink-secondary">
            Your account isn&apos;t linked to a client record yet. Contact Hostello to get set up.
          </p>
          <form action={logout} className="mt-4">
            <SubmitButton
              className="text-xs text-ink-secondary border border-border-hairline rounded-md px-3 py-1.5 hover:border-border-strong transition-colors"
              busy="Signing you out…"
            >
              Sign out
            </SubmitButton>
          </form>
        </div>
      </div>
    );
  }

  const [notifications, unreadCount, preferences] = await Promise.all([
    readNotifications(user.id, { limit: 8, portal: "client" }),
    unreadNotificationCount(user.id),
    readNotificationPreferences(user.id),
  ]);

  return (
    <>
      {/* Reads the query string, so it needs its own boundary. */}
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      <ClientShell
        userName={profile?.full_name ?? clientRecord.name}
        clientName={clientRecord.name}
        unreadCount={unreadCount}
        notifications={notifications}
        logoutAction={logout}
        searchAction={searchClient}
        markAllReadAction={markAllNotificationsRead}
      >
        {children}
      </ClientShell>
      <NotificationLive
        userId={user.id}
        portal="client"
        soundEnabled={preferences.soundEnabled}
        mutedCategories={preferences.mutedCategories}
      />
    </>
  );
}
