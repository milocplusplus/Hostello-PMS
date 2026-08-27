import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificationHref } from "@/lib/notifications";

/**
 * Browser push delivery.
 *
 * Push is the only part of the notification system that needs to reach a person
 * who is not looking at the app, which is also why it is the only part that
 * needs credentials the app cannot derive: a VAPID key pair to sign for the push
 * services, and the service-role key to read another user's subscription. With
 * either missing this module does nothing and says so once — the bell, the feed,
 * the unread counts and the realtime updates never depend on it.
 *
 * The same `push_subscriptions` rows are what an Android/iOS build would write
 * with `platform = 'android' | 'ios'`; those are skipped here because they need
 * FCM/APNs rather than Web Push.
 */

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:ops@hostello.pk";

export const pushConfigured = Boolean(publicKey && privateKey);

if (pushConfigured) {
  webpush.setVapidDetails(subject, publicKey as string, privateKey as string);
}

type PushPayload = {
  title: string;
  body: string | null;
  url: string;
  category: string;
  /** Collapses repeats of the same event on the OS side. */
  tag: string;
};

/**
 * Sends one notification to every recipient who has push on and has not been
 * pushed yet. Best-effort in the same way `emit` is: the notification is already
 * saved, and a push that fails must never take the Server Action down with it.
 */
export async function deliverPush(notificationId: string): Promise<void> {
  if (!pushConfigured) return;

  const admin = createAdminClient();
  if (!admin) return;

  try {
    const { data: notification } = await admin
      .from("notifications")
      .select("id, kind, category, title, body, booking_id, property_id")
      .eq("id", notificationId)
      .maybeSingle();
    if (!notification) return;

    const { data: recipients } = await admin
      .from("notification_recipients")
      .select("id, user_id")
      .eq("notification_id", notificationId)
      .is("pushed_at", null);
    if (!recipients || recipients.length === 0) return;

    const userIds = [...new Set(recipients.map((r) => r.user_id))];

    // Preferences, devices and portal (the link differs per portal) in one trip.
    const [{ data: prefs }, { data: subs }, { data: profiles }] = await Promise.all([
      admin
        .from("notification_preferences")
        .select("user_id, push_enabled, muted_categories")
        .in("user_id", userIds),
      admin
        .from("push_subscriptions")
        .select("id, user_id, platform, endpoint, p256dh, auth")
        .in("user_id", userIds)
        .eq("platform", "web")
        .is("failed_at", null),
      admin.from("profiles").select("id, role").in("id", userIds),
    ]);

    if (!subs || subs.length === 0) return;

    const prefByUser = new Map((prefs ?? []).map((p) => [p.user_id, p]));
    const roleByUser = new Map((profiles ?? []).map((p) => [p.id, p.role]));

    const tag = `${notification.kind}:${
      notification.booking_id ?? notification.property_id ?? notification.id
    }`;

    const dead: string[] = [];
    const sent = await Promise.allSettled(
      subs.map(async (sub) => {
        const pref = prefByUser.get(sub.user_id);
        // No preferences row yet means the defaults, which are push on.
        if (pref && pref.push_enabled === false) return;
        if (pref && (pref.muted_categories ?? []).includes(notification.category)) return;

        const portal = roleByUser.get(sub.user_id) === "admin" ? "admin" : "client";
        const payload: PushPayload = {
          title: notification.title,
          body: notification.body,
          url: notificationHref(notification, portal),
          category: notification.category,
          tag,
        };

        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh ?? "", auth: sub.auth ?? "" },
            },
            JSON.stringify(payload),
            // Urgency "high" is what gets a push past Android's Doze. The default,
            // "normal", lets the phone sit on it until it next wakes for its own
            // reasons — which is why these only landed when the app was opened.
            { TTL: 60 * 60 * 12, urgency: "high" }
          );
        } catch (err) {
          // 404/410 mean the browser threw the subscription away — stop trying.
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) dead.push(sub.id);
          throw err;
        }
      })
    );

    if (dead.length > 0) {
      await admin
        .from("push_subscriptions")
        .update({ failed_at: new Date().toISOString() })
        .in("id", dead);
    }

    // Mark the attempt whatever the outcome: a push that failed twice is worse
    // than one that never arrived, and the row is still in the feed either way.
    if (sent.length > 0) {
      await admin
        .from("notification_recipients")
        .update({ pushed_at: new Date().toISOString() })
        .in(
          "id",
          recipients.map((r) => r.id)
        );
    }
  } catch {
    // Deliberately swallowed — see the note at the top.
  }
}
