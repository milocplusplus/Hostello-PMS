"use client";

import { useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";
import {
  promptInstall,
  readInstallHint,
  readInstallState,
  serverInstallState,
  subscribeInstall,
  type InstallHint,
} from "@/lib/pwa-install";

/**
 * "Get the app" in the sidebar of both portals.
 *
 * Only one browser situation gives a one-tap install: Chrome-family, on a site
 * it has decided is installable, before the user has installed it. Every other
 * combination — Safari, Firefox, and Chrome whenever it simply hasn't offered —
 * gets the instruction for that browser instead of a missing button. Hiding it
 * in those cases made the feature invisible to most people looking for it.
 *
 * The one case that still renders nothing is Hostello already running installed,
 * where an install control would be dead.
 */

const HINTS: Record<InstallHint, { lead: React.ReactNode; note?: string }> = {
  ios: {
    lead: (
      <>
        In Safari, tap <Share size={11} className="inline mx-0.5" /> at the bottom of the screen,
        then <span className="text-ink-primary">Add to Home Screen</span>.
      </>
    ),
    note: "On iPhone, alerts only work from the home-screen version.",
  },
  android: {
    lead: (
      <>
        Open Chrome&apos;s <span className="text-ink-primary">⋮</span> menu, then{" "}
        <span className="text-ink-primary">Add to Home screen</span>.
      </>
    ),
  },
  "chromium-desktop": {
    lead: (
      <>
        Click the install icon at the right of the address bar. If it isn&apos;t there, open the{" "}
        <span className="text-ink-primary">⋮</span> menu and look for{" "}
        <span className="text-ink-primary">Install</span>.
      </>
    ),
  },
  "safari-desktop": {
    lead: (
      <>
        In Safari, choose <span className="text-ink-primary">File → Add to Dock</span>.
      </>
    ),
  },
  firefox: {
    lead: <>Firefox doesn&apos;t install web apps. Pin the tab or bookmark Hostello instead.</>,
    note: "Notifications still work in a normal Firefox tab.",
  },
  other: {
    lead: (
      <>
        Look for <span className="text-ink-primary">Install</span> or{" "}
        <span className="text-ink-primary">Add to Home Screen</span> in your browser&apos;s menu.
      </>
    ),
  },
};

export function InstallAppButton() {
  const state = useSyncExternalStore(subscribeInstall, readInstallState, serverInstallState);
  const hintKind = useSyncExternalStore(subscribeInstall, readInstallHint, () => "other" as const);
  const [showHint, setShowHint] = useState(false);

  if (state === "installed") return null;

  // The one-tap path: the browser handed us a prompt and we still hold it.
  if (state === "ready") {
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

  const hint = HINTS[hintKind];

  return (
    <div className="px-3 pb-2">
      <button
        type="button"
        onClick={() => setShowHint((v) => !v)}
        aria-expanded={showHint}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
      >
        <Download size={16} strokeWidth={2} />
        <span className="flex-1 text-left">Get the app</span>
      </button>

      {showHint && (
        <div className="mt-1 rounded-md bg-surface-2 p-3 relative">
          <button
            type="button"
            onClick={() => setShowHint(false)}
            aria-label="Close"
            className="absolute top-2 right-2 text-ink-muted hover:text-ink-primary transition-colors"
          >
            <X size={13} />
          </button>
          <p className="text-[11px] text-ink-secondary leading-relaxed pr-4">{hint.lead}</p>
          {hint.note && (
            <p className="text-[11px] text-ink-muted mt-1.5 leading-relaxed">{hint.note}</p>
          )}
        </div>
      )}
    </div>
  );
}
