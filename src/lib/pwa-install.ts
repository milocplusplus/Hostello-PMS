/**
 * Installing Hostello to a home screen / desktop.
 *
 * `beforeinstallprompt` fires once, early — often before React has hydrated —
 * and the event is the only way to trigger an install later. So the listener is
 * registered at *module* scope rather than in an effect: by the time a component
 * mounts and asks, the answer is already here. Two components need it (the
 * banner and the sidebar button), so both read this one store instead of racing
 * for the same event.
 */

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState =
  /** Already running as an installed app — nothing to offer. */
  | "installed"
  /** Safari: no install event exists; the user has to use Share → Add to Home Screen. */
  | "ios"
  /** The browser has offered an install prompt and we are holding it. */
  | "ready"
  /** Installable in principle, but this browser has not offered a prompt. */
  | "unavailable";

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

/**
 * Which "install it yourself" instruction to show when the browser gives us no
 * prompt to fire — which is most desktop browsers, most of the time. Sniffing
 * the user agent is imprecise, but the cost of getting it wrong is one slightly
 * off sentence, and the cost of showing nothing is a feature nobody can find.
 */
export type InstallHint =
  | "ios"
  | "android"
  | "chromium-desktop"
  | "safari-desktop"
  | "firefox"
  | "other";

export function readInstallHint(): InstallHint {
  if (typeof window === "undefined") return "other";
  const ua = window.navigator.userAgent;

  if (isIos()) return "ios";
  if (isAndroid()) return "android";
  if (/firefox|fxios/i.test(ua)) return "firefox";
  if (/edg|chrome|chromium/i.test(ua)) return "chromium-desktop";
  if (/safari/i.test(ua)) return "safari-desktop";
  return "other";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari doesn't report display-mode; it sets this instead.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * "Request desktop site" rewrites the whole user-agent string, so an Android
 * phone in that mode looks exactly like Chrome on a laptop. Client hints are
 * the one signal it does not rewrite, so they are asked first.
 */
function isAndroid(): boolean {
  const data = (window.navigator as Navigator & {
    userAgentData?: { platform?: string; mobile?: boolean };
  }).userAgentData;
  if (data?.platform === "Android") return true;
  return /android/i.test(window.navigator.userAgent);
}

function isIos(): boolean {
  const ua = window.navigator.userAgent;
  // An iPad on iPadOS 13+ reports itself as a Mac; the touch points give it away.
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1)
  );
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readInstallState(): InstallState {
  if (typeof window === "undefined") return "unavailable";
  if (installed || isStandalone()) return "installed";
  if (deferred) return "ready";
  return isIos() ? "ios" : "unavailable";
}

/** The server has no window, so it always renders the "nothing to offer" case. */
export function serverInstallState(): InstallState {
  return "unavailable";
}

/** Returns true when the user actually accepted. The event is single-use. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  emit();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === "accepted";
  } catch {
    return false;
  }
}
