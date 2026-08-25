import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { AdminShell } from "@/components/admin/AdminShell";
import { searchAdmin } from "@/app/admin/search/actions";
import { markAllReadAdmin } from "@/app/admin/notifications/actions";
import {
  formatNotificationTime,
  notificationHref,
  type NotificationItem,
} from "@/lib/notifications";

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  booking_id: string | null;
  property_id: string | null;
  admin_read_at: string | null;
  created_at: string;
  clients: unknown;
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/client");

  // The bell shows the same rows the clients get, across the whole portfolio —
  // admins have their own unread mark (`admin_read_at`).
  const [{ data: recent }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("notifications")
      .select(
        "id, kind, title, body, booking_id, property_id, admin_read_at, created_at, clients(name)"
      )
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .is("admin_read_at", null),
  ]);

  const notifications: NotificationItem[] = ((recent ?? []) as unknown as NotificationRow[]).map(
    (n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      when: formatNotificationTime(n.created_at),
      unread: !n.admin_read_at,
      href: notificationHref(n, "admin"),
      who: (n.clients as { name: string } | null)?.name ?? null,
    })
  );

  return (
    <AdminShell
      userName={profile?.full_name ?? "Admin"}
      logoutAction={logout}
      searchAction={searchAdmin}
      notifications={notifications}
      unreadCount={unreadCount ?? 0}
      markAllReadAction={markAllReadAdmin}
    >
      {children}
    </AdminShell>
  );
}
