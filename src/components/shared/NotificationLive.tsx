"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createElement, useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { playNotificationSound } from "@/lib/notification-sounds";
import {
  notificationHref,
  notificationIcon,
  type NotificationCategory,
} from "@/lib/notifications";

type Incoming = {
  id: string;
  kind: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  href: string;
};

/**
 * Live notifications, without a poll.
 *
 * Postgres tells Supabase Realtime that a `notification_recipients` row was
 * inserted; RLS means the socket only ever carries this user's rows, and the
 * `user_id` filter keeps the browser from being woken by anyone else's. The
 * counts and the bell list stay server-rendered — the socket just asks Next for
 * a fresh render — so there is exactly one place that decides what the feed says.
 */
export function NotificationLive({
  userId,
  portal,
  soundEnabled,
  mutedCategories,
}: {
  userId: string;
  portal: "admin" | "client";
  soundEnabled: boolean;
  mutedCategories: NotificationCategory[];
}) {
  const router = useRouter();
  const [toast, setToast] = useState<Incoming | null>(null);

  // A stable dependency: the array identity changes on every render, the string
  // only changes when the preference actually changes.
  const mutedKey = mutedCategories.join(",");

  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    const supabase = createClient();
    const muted = mutedKey ? mutedKey.split(",") : [];

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification_recipients",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const notificationId = (payload.new as { notification_id?: string }).notification_id;

          // The bell, the unread badge and the feed are all server-rendered.
          router.refresh();

          if (!notificationId) return;

          const { data } = await supabase
            .from("notifications")
            .select("id, kind, category, title, body, booking_id, property_id")
            .eq("id", notificationId)
            .maybeSingle();
          if (!data) return;

          // Muting a category silences the alert; the row still lands in the
          // feed, so nothing is ever lost because of a preference.
          if (muted.includes(data.category)) return;

          if (soundEnabled) playNotificationSound(data.category as NotificationCategory);

          setToast({
            id: data.id,
            kind: data.kind,
            category: data.category as NotificationCategory,
            title: data.title,
            body: data.body,
            href: notificationHref(data, portal),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, portal, soundEnabled, mutedKey, router]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  const critical = toast.category === "critical";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-50 bottom-4 right-4 left-4 sm:left-auto sm:w-80 animate-in"
    >
      <div
        className={`card p-3 flex gap-3 shadow-[var(--shadow-card)] ${
          critical ? "border-status-booked/50" : ""
        }`}
      >
        <span
          className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
            critical ? "bg-status-booked/15" : "bg-surface-3"
          }`}
        >
          {/* createElement, not `const Icon = …`: naming a component inside a
              render body is what `react-hooks/static-components` objects to. */}
          {createElement(notificationIcon(toast.kind), {
            size: 14,
            className: critical ? "text-status-booked" : "text-hostello-purple-light",
          })}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={toast.href}
            onClick={dismiss}
            className="text-sm text-ink-primary leading-snug hover:text-hostello-gold transition-colors block"
          >
            {toast.title}
          </Link>
          {toast.body && (
            <p className="text-xs text-ink-secondary mt-0.5 line-clamp-2">{toast.body}</p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-ink-muted hover:text-ink-primary transition-colors shrink-0 h-fit"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
