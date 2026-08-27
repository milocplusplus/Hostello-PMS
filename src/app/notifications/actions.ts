"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/notifications";

/**
 * Shared notification actions — both portals use exactly these.
 *
 * Read state, push subscriptions and preferences all belong to the *user*, not
 * to the client record, so every one of these is scoped by `auth.uid()` and RLS
 * enforces the same thing a second time in the database.
 *
 * This folder has no `page.tsx`, so it is not a route; it is where the two
 * portals meet.
 */

function revalidateBothPortals() {
  // The bell is rendered by both layouts; whichever one the caller is in, the
  // other is not being displayed, so refreshing both costs nothing real.
  revalidatePath("/admin", "layout");
  revalidatePath("/client", "layout");
}

export async function markNotificationRead(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notification_recipients")
    .update({ read_at: new Date().toISOString() })
    .eq("notification_id", id)
    .eq("user_id", user.id)
    .is("read_at", null);

  revalidateBothPortals();
}

export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notification_recipients")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  revalidateBothPortals();
}

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

/**
 * One row per browser. The endpoint is unique, so re-subscribing on a device
 * that already has a row updates it — including clearing `failed_at`, which is
 * how a subscription the push service had dropped comes back to life.
 */
export async function savePushSubscription(sub: PushSubscriptionInput) {
  if (!sub?.endpoint || !sub.p256dh || !sub.auth) return { error: "Incomplete subscription." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      platform: "web",
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent?.slice(0, 400) ?? null,
      last_seen_at: new Date().toISOString(),
      failed_at: null,
    },
    { onConflict: "endpoint" }
  );

  if (error) return { error: error.message };

  await supabase
    .from("notification_preferences")
    .upsert(
      { user_id: user.id, push_enabled: true, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  revalidateBothPortals();
  return { error: null };
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // RLS already scopes this to the caller; the filter keeps it explicit.
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  revalidateBothPortals();
  return { error: null };
}

export async function saveNotificationPreferences(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Unchecked boxes are absent from the payload, so a category is muted unless
  // its box came back ticked.
  const muted = CATEGORIES.filter((c) => formData.get(`category_${c.key}`) === null).map(
    (c) => c.key
  );

  await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      push_enabled: formData.get("push_enabled") !== null,
      sound_enabled: formData.get("sound_enabled") !== null,
      muted_categories: muted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  revalidateBothPortals();
}
