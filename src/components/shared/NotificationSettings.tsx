"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff, Volume2 } from "lucide-react";
import {
  savePushSubscription,
  removePushSubscription,
  saveNotificationPreferences,
} from "@/app/notifications/actions";
import { CATEGORIES, type NotificationPreferences } from "@/lib/notifications";
import { playNotificationSound } from "@/lib/notification-sounds";
import { iosNeedsInstallForPush } from "@/lib/pwa-install";
import { secondaryButton } from "@/lib/form-styles";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** The push service wants the VAPID key as raw bytes, not base64url text. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  // Built over an explicit ArrayBuffer: `applicationServerKey` will not take a
  // Uint8Array that might be backed by a SharedArrayBuffer.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type PushState =
  | "checking"
  | "unsupported"
  | "ios-install"
  | "unconfigured"
  | "no-sw"
  | "denied"
  | "on"
  | "off";

function PushDeviceToggle() {
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function read(): Promise<PushState> {
      if (typeof window === "undefined") return "checking";
      // Before the capability checks, not after: in a Safari tab iOS exposes
      // neither PushManager nor Notification, so every check below reports a
      // browser that can never do this — when it can, once installed.
      if (iosNeedsInstallForPush()) return "ios-install";
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
      if (!VAPID_PUBLIC_KEY) return "unconfigured";
      if (typeof Notification === "undefined") return "unsupported";
      if (Notification.permission === "denied") return "denied";

      const registration = await navigator.serviceWorker.getRegistration();
      // The service worker only registers in a production build, on purpose.
      if (!registration) return "no-sw";

      const existing = await registration.pushManager.getSubscription();
      return existing ? "on" : "off";
    }

    read().then(
      (next) => {
        if (!cancelled) setState(next);
      },
      () => {
        if (!cancelled) setState("unsupported");
      }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };

      const result = await savePushSubscription({
        endpoint: json.endpoint ?? "",
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });

      setState(result?.error ? "off" : "on");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      // Leave the state alone: the row may or may not still be there, and the
      // next read on mount is what settles it.
    } finally {
      setBusy(false);
    }
  }

  const message: Partial<Record<PushState, string>> = {
    checking: "Checking this device…",
    unsupported: "This browser can't receive push notifications.",
    "ios-install":
      "On iPhone and iPad, add Hostello to your Home Screen first — iOS only gives notifications to installed apps. Use Get the app in the sidebar.",
    unconfigured: "Push isn't configured on the server yet.",
    "no-sw": "Install Hostello (or open the deployed app) to turn push on for this device.",
    denied: "Notifications are blocked for this site in your browser settings.",
    on: "This device receives alerts when Hostello is closed.",
    off: "Turn on to get alerts on this device when Hostello is closed.",
  };

  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-md bg-surface-3 flex items-center justify-center shrink-0">
          {state === "on" ? (
            <BellRing size={14} className="text-hostello-gold" />
          ) : (
            <BellOff size={14} className="text-ink-muted" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-ink-primary">Push on this device</p>
          <p className="text-xs text-ink-secondary mt-0.5">{message[state]}</p>
        </div>
      </div>

      {(state === "on" || state === "off") && (
        <button
          type="button"
          disabled={busy}
          onClick={state === "on" ? disable : enable}
          className={`${secondaryButton} disabled:opacity-60`}
        >
          {busy ? "Working…" : state === "on" ? "Turn off" : "Turn on"}
        </button>
      )}
    </div>
  );
}

const checkbox =
  "w-4 h-4 accent-[var(--color-hostello-purple-glow)] shrink-0 cursor-pointer";

/**
 * Notification preferences. Muting a category silences its sound and its push —
 * the notification still lands in the feed, so a preference can never lose one.
 */
export function NotificationSettings({
  preferences,
}: {
  preferences: NotificationPreferences;
}) {
  return (
    <section className="card p-4 md:p-5 flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Notification preferences</h2>
        <p className="text-xs text-ink-secondary mt-1">
          These apply to your account, on every device you sign in on.
        </p>
      </div>

      <PushDeviceToggle />

      <form action={saveNotificationPreferences} className="flex flex-col gap-4 border-t border-border-hairline pt-4">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            name="push_enabled"
            defaultChecked={preferences.pushEnabled}
            className={checkbox}
          />
          <span className="text-sm text-ink-secondary">Send push notifications to my devices</span>
        </label>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              name="sound_enabled"
              defaultChecked={preferences.soundEnabled}
              className={checkbox}
            />
            <span className="text-sm text-ink-secondary">Play a sound when one arrives</span>
          </label>
          <button
            type="button"
            onClick={() => playNotificationSound("booking")}
            className="text-xs text-ink-muted hover:text-ink-primary transition-colors flex items-center gap-1.5"
          >
            <Volume2 size={13} />
            Hear it
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-ink-muted">Alert me about</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CATEGORIES.map((c) => (
              <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name={`category_${c.key}`}
                  defaultChecked={!preferences.mutedCategories.includes(c.key)}
                  className={checkbox}
                />
                <span className="text-sm text-ink-secondary">{c.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <button type="submit" className={secondaryButton}>
            Save preferences
          </button>
        </div>
      </form>
    </section>
  );
}
