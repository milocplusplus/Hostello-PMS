"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";
import {
  promptInstall,
  readInstallState,
  serverInstallState,
  subscribeInstall,
} from "@/lib/pwa-install";

const DISMISSED_KEY = "hostello-install-dismissed";

const noSubscribe = () => () => {};

/** Read once on mount — a dismissal only has to survive a reload, not a render. */
function useDismissed(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return localStorage.getItem(DISMISSED_KEY) === "1";
      } catch {
        // Private mode, or site data blocked. Showing the banner is the safe miss.
        return false;
      }
    },
    () => true
  );
}

/**
 * Registers the service worker and offers "Install app" as a one-time banner.
 *
 * Whether an install is possible — and the event that performs it — comes from
 * `lib/pwa-install`, which starts listening as the bundle loads; `beforeinstallprompt`
 * often fires before React hydrates, and an effect-registered listener can miss
 * it outright. The sidebar's "Get the app" button reads the same store.
 */
export function PwaSetup() {
  const state = useSyncExternalStore(subscribeInstall, readInstallState, serverInstallState);
  const alreadyDismissed = useDismissed();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Production only: in dev, cache-first would hand back stale Turbopack chunks
    // after an edit, which looks exactly like a bug that isn't there.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration only costs the offline fallback — never the app.
      });
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Not being able to remember the dismissal is not worth an error.
    }
    setDismissed(true);
  }

  if (dismissed || alreadyDismissed) return null;
  if (state === "installed" || state === "unavailable") return null;

  const showIosHint = state === "ios";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pointer-events-none">
      <div className="card mx-auto max-w-sm p-3 flex items-center gap-3 pointer-events-auto animate-in">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 gradient-brand text-white text-sm font-semibold">
          H
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-primary leading-tight">Install Hostello</p>
          {showIosHint ? (
            <p className="text-[11px] text-ink-secondary mt-0.5 flex items-center gap-1 flex-wrap">
              Tap <Share size={11} className="inline shrink-0" /> then
              &ldquo;Add to Home Screen&rdquo;
            </p>
          ) : (
            <p className="text-[11px] text-ink-secondary mt-0.5">
              Keep it one tap away on your home screen
            </p>
          )}
        </div>

        {state === "ready" && (
          <button
            type="button"
            onClick={() => promptInstall()}
            className="rounded-md py-1.5 px-3 text-xs font-medium text-white flex items-center gap-1.5 shrink-0 gradient-brand"
          >
            <Download size={13} />
            Install
          </button>
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="p-1 text-ink-muted hover:text-ink-primary transition-colors shrink-0"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
