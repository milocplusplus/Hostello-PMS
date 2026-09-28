import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentProfile, currentUser, isStaffRole } from "@/lib/auth";
import { notificationHref } from "@/lib/notifications";

/**
 * Where a push raised by the database lands when it is tapped.
 *
 * Pushes sent from the app carry their destination already (`push.ts` runs
 * `notificationHref`). The ones sent by the `push-sweep` edge function — for
 * alerts the database raised on its own, from the sync, the channel inbox and
 * the morning jobs — cannot, because a Deno function cannot import the app's
 * TypeScript. They open this page instead, which marks the alert read and
 * sends the reader where `notificationHref` says. One routing rule, not two.
 *
 * Reading the notification goes through RLS, so a link opened by anyone who
 * was not one of its recipients finds nothing and lands on their home page.
 */
export default async function OpenNotification({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");

  const [profile, supabase] = await Promise.all([currentProfile(), createClient()]);
  const portal = isStaffRole(profile?.role) ? "admin" : "client";

  const { data: row } = await supabase
    .from("notifications")
    .select("id, kind, booking_id, property_id")
    .eq("id", id)
    .maybeSingle();

  if (!row) redirect(portal === "admin" ? "/admin" : "/client");

  await supabase
    .from("notification_recipients")
    .update({ read_at: new Date().toISOString() })
    .eq("notification_id", id)
    .eq("user_id", user.id)
    .is("read_at", null);

  redirect(notificationHref(row, portal));
}
