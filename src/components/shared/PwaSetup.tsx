"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "hostello-install-dismissed";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari doesn't report display-mode; it sets this instead
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

const noSubscribe = () => () => {};

/**
 * Whether to offer installing, and how. Read through `useSyncExternalStore` so
 * the server renders nothing and the browser's answer arrives after hydration —
 * `window` can't be touched during render, and neither can an effect set state.
 */
function useInstallMode(): "hidden" | "ios" | "prompt" {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      if (isStandalone() || localStorage.getItem(DISMISSED_KEY) === "1") return "hidden";
      return isIos() ? "ios" : "prompt";
    },
    () => "hidden" as const
  );
}

/**
 * Registers the service worker and offers "Install app".
 *
 * Android/Chrome fires `beforeinstallprompt`, so we can install in one tap.
 * iOS has no such event — Safari only installs via Share → Add to Home Screen,
 * so there we show that instruction instead of a button that couldn't work.
 */
export function PwaSetup() {
  const mode = useInstallMode();
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
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

  useEffect(() => {
    if (mode !== "prompt") return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [mode]);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  const showIosHint = mode === "ios";
  if (dismissed || (!showIosHint && !deferred)) return null;

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

        {deferred && (
          <button
            type="button"
            onClick={install}
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
