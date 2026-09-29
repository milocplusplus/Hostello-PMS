import { savePushSubscription } from "@/app/notifications/actions";

/**
 * Browser-side push helpers: the VAPID public key as the push service wants
 * it, and keeping a device's subscription signed with the key the server
 * sends with.
 */

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** The push service wants the VAPID key as raw bytes, not base64url text. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  // Built over an explicit ArrayBuffer: `applicationServerKey` will not take a
  // Uint8Array that might be backed by a SharedArrayBuffer.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * A subscription made with an older VAPID key can never be pushed to again —
 * the push service refuses anything signed with a different key — yet the
 * browser still reports it as "on". When the keys are replaced (as on
 * 2026-09-29, the old private key being unrecoverable from Vercel), this
 * swaps each device over the next time the app opens: unsubscribe, and if
 * notifications are still allowed, subscribe again with the current key and
 * save it. Silent, and harmless when nothing has changed.
 */
export async function refreshStalePushSubscription(registration: ServiceWorkerRegistration): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !("PushManager" in window)) return;

  const existing = await registration.pushManager.getSubscription();
  if (!existing) return;

  const current = existing.options.applicationServerKey;
  const wanted = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  // Some browsers don't say which key a subscription used; then there is
  // nothing to compare, and churning a working subscription would be worse.
  if (!current || sameBytes(new Uint8Array(current), wanted)) return;

  await existing.unsubscribe();
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const fresh = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
  const json = fresh.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const result = await savePushSubscription({
    endpoint: json.endpoint ?? "",
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    userAgent: navigator.userAgent,
  });

  // Signed out (the login page mounts this too): don't leave the browser
  // claiming a subscription the server never heard of.
  if (result?.error) await fresh.unsubscribe();
}
