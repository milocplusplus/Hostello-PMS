"use client";

import { useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";
import {
  promptInstall,
  readInstallState,
  serverInstallState,
  subscribeInstall,
} from "@/lib/pwa-install";

/**
 * "Get the app" in the sidebar of both portals.
 *
 * Renders nothing once Hostello is already installed — an install button inside
 * the installed app is a dead control. On iPhone there is no install API at all,
 * so it opens the Share → Add to Home Screen instruction instead of a button
 * that could not work.
 */
export function InstallAppButton() {
  const state = useSyncExternalStore(subscribeInstall, readInstallState, serverInstallState);
  const [showIosHint, setShowIosHint] = useState(false);

  if (state === "installed") return null;

  // A desktop browser with no install support has nothing to offer either.
  if (state === "unavailable") return null;

  if (state === "ios") {
    return (
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => setShowIosHint((v) => !v)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
        >
          <Download size={16} strokeWidth={2} />
          <span className="flex-1 text-left">Get the app</span>
        </button>

        {showIosHint && (
          <div className="mt-1 rounded-md bg-surface-2 p-3 relative">
            <button
              type="button"
              onClick={() => setShowIosHint(false)}
              aria-label="Close"
              className="absolute top-2 right-2 text-ink-muted hover:text-ink-primary transition-colors"
            >
              <X size={13} />
            </button>
            <p className="text-[11px] text-ink-secondary leading-relaxed pr-4">
              In Safari, tap <Share size={11} className="inline mx-0.5" /> at the bottom of the
              screen, then <span className="text-ink-primary">Add to Home Screen</span>.
            </p>
            <p className="text-[11px] text-ink-muted mt-1.5 leading-relaxed">
              Alerts on iPhone only work from the home-screen version.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-3 pb-2">
      <button
        type="button"
        onClick={() => promptInstall()}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-white transition-transform hover:scale-[1.02] gradient-brand"
      >
        <Download size={16} strokeWidth={2} />
        <span className="flex-1 text-left">Get the app</span>
      </button>
    </div>
  );
}
