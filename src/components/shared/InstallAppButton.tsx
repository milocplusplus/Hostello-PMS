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
 * Android gets a real download: APK_URL is a signed Android app (a Trusted Web
 * Activity wrapping this same site), so the phone installs Hostello the way it
 * installs anything else — its own icon, its own entry in the app drawer, no
 * browser chrome. That beats the one-tap web install, which Chrome offers only
 * when it feels like it.
 *
 * Everywhere else there is no file to hand over. Chrome-family desktop may give
 * a one-tap prompt; Safari, Firefox and iOS never do, so they get the
 * instruction for that browser rather than a missing button. Hiding it in those
 * cases made the feature invisible to most people looking for it.
 *
 * It renders in every state, including inside the installed app — someone who
 * goes looking for "get the app" is usually installing it somewhere else, or
 * pulling a fresh APK. Running installed only changes what the panel says.
 */

/** Built by Bubblewrap from the PWA manifest; the rebuild is in STATE.md. */
const APK_URL = "/app/hostello.apk";

const HINTS: Record<InstallHint | "installed", { lead: React.ReactNode; note?: string }> = {
  installed: {
    lead: <>You&apos;re using the installed app right now.</>,
    note: "Open Hostello in a browser on another device to install it there too.",
  },
  ios: {
    lead: (
      <>
        In Safari, tap <Share size={11} className="inline mx-0.5" /> at the bottom of the screen,
        then <span className="text-ink-primary">Add to Home Screen</span>.
      </>
    ),
    note: "It opens fullscreen with its own icon — no Safari bar. That is the iPhone install; Apple allows no other kind.",
  },
  android: {
    lead: (
      <>
        Downloading Hostello. Open it from your notifications and tap{" "}
        <span className="text-ink-primary">Install</span>.
      </>
    ),
    // Sideloading always trips people the first time; say it before Android does.
    note: "Android asks once whether to allow installs from your browser — say yes. That prompt is because Hostello isn't on the Play Store, not because anything is wrong.",
  },
  "chromium-desktop": {
    lead: (
      <>
        Click the install icon at the right of the address bar, or open the{" "}
        <span className="text-ink-primary">⋮</span> menu and choose{" "}
        <span className="text-ink-primary">Install Hostello</span>.
      </>
    ),
    note: "It opens in its own window, with no address bar.",
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

  // Android is the one platform with a file to hand over, so it is checked
  // before the web-install prompt: on a phone, "get the app" means an entry in
  // the app drawer, and the APK is the only thing that gives one.
  if (hintKind === "android") {
    return (
      <div className="px-3 pb-2">
        <a
          href={APK_URL}
          download
          onClick={() => setShowHint(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-white transition-transform hover:scale-[1.02] gradient-brand"
        >
          <Download size={16} strokeWidth={2} />
          <span className="flex-1 text-left">Get the app</span>
        </a>
        {showHint && <HintPanel hint={HINTS.android} onClose={() => setShowHint(false)} />}
      </div>
    );
  }

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

  const hint = state === "installed" ? HINTS.installed : HINTS[hintKind];

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

      {showHint && <HintPanel hint={hint} onClose={() => setShowHint(false)} />}
    </div>
  );
}

function HintPanel({
  hint,
  onClose,
}: {
  hint: { lead: React.ReactNode; note?: string };
  onClose: () => void;
}) {
  return (
    <div className="mt-1 rounded-md bg-surface-2 p-3 relative">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-2 right-2 text-ink-muted hover:text-ink-primary transition-colors"
      >
        <X size={13} />
      </button>
      <p className="text-[11px] text-ink-secondary leading-relaxed pr-4">{hint.lead}</p>
      {hint.note && <p className="text-[11px] text-ink-muted mt-1.5 leading-relaxed">{hint.note}</p>}
    </div>
  );
}
