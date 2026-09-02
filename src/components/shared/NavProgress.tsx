"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A hairline across the top of the app for the gap between clicking a link and
 * the server answering. `loading.tsx` covers the page body, but nothing covers
 * the moment before it — the click itself, which is where a slow route feels
 * broken. This fires on the click and clears when the route lands.
 *
 * Anchors are caught here so no link has to opt in. The select controls that
 * navigate with `router.push` have no anchor to catch, so they call
 * `startNavProgress()` themselves.
 */

let subscriber: ((from: string) => void) | null = null;

/** Nudge the bar on for a navigation that is not a link click. */
export function startNavProgress() {
  subscriber?.(currentRouteKey());
}

/** Path + query, normalised the same way `useSearchParams` normalises it. */
function currentRouteKey() {
  const query = new URLSearchParams(window.location.search).toString();
  return `${window.location.pathname}?${query}`;
}

export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const routeKey = `${pathname}?${search}`;

  // Two halves of one wait, because the URL changes long before the page does.
  //
  // Where we were when the click happened. Still being there means the router
  // has not even swapped the URL yet — derived, so nothing has to remember to
  // switch the bar off again.
  const [from, setFrom] = useState<string | null>(null);
  const clicked = from !== null && from === routeKey;

  // Once the URL has changed, the server render is still in flight. Next runs
  // that as a transition, and a deferred value lags behind a transition until
  // it commits — so the two keys differ for exactly as long as the wait lasts.
  const settling = routeKey !== useDeferredValue(routeKey);

  const busy = clicked || settling;

  useEffect(() => {
    if (!clicked) return;
    // A click that never becomes a navigation — a redirect back to where we
    // started, an action that throws — must not leave the bar running forever.
    const timer = window.setTimeout(() => setFrom(null), 12000);
    return () => window.clearTimeout(timer);
  }, [clicked]);

  useEffect(() => {
    subscriber = setFrom;

    function onClick(e: MouseEvent) {
      // Deliberately not skipping `defaultPrevented`: a client-side navigation
      // is exactly a link click that `<Link>` has already cancelled, so that
      // check would skip every link in the app.
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Already here: nothing will change, so nothing would ever clear the bar.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      setFrom(currentRouteKey());
    }

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      subscriber = null;
    };
  }, []);

  if (!busy) return null;

  return (
    <div
      role="status"
      aria-label="Loading the next page"
      className="fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden pointer-events-none"
    >
      <div className="nav-progress h-full w-full" />
    </div>
  );
}
