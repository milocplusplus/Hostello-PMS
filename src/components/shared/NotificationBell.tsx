"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import { notificationIcon, type NotificationItem } from "@/lib/notifications";

/**
 * Top-bar bell. Items and the unread count come from the server; the only
 * client state is whether the panel is open.
 */
export function NotificationBell({
  items,
  unreadCount,
  allHref,
  markAllAction,
}: {
  items: NotificationItem[];
  unreadCount: number;
  allHref: string;
  markAllAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 text-[10px] font-medium text-surface-0 rounded-full min-w-[17px] h-[17px] px-1 flex items-center justify-center"
            style={{ backgroundColor: "var(--color-hostello-gold)" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Right-anchored to the bell, so the width has to leave room for
              whatever sits to its right on a phone. */}
          <div className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-6rem))] card z-50 overflow-hidden animate-in">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-hairline">
              <p className="text-sm font-medium">Notifications</p>
              {unreadCount > 0 && (
                <form action={markAllAction}>
                  <button
                    type="submit"
                    className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
                  >
                    Mark all read
                  </button>
                </form>
              )}
            </div>

            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-ink-muted">
                Nothing yet. Bookings and blocked dates show up here.
              </p>
            ) : (
              <ul className="max-h-[22rem] overflow-y-auto divide-y divide-[var(--color-border-hairline)]">
                {items.map((n) => {
                  const Icon = notificationIcon(n.kind);
                  return (
                    <li key={n.id}>
                      <Link
                        href={n.href}
                        onClick={() => setOpen(false)}
                        className={`flex gap-3 px-4 py-3 transition-colors hover:bg-surface-2 ${
                          n.unread ? "bg-surface-2/50" : ""
                        }`}
                      >
                        <span className="w-7 h-7 rounded-md bg-surface-3 flex items-center justify-center shrink-0">
                          <Icon size={13} className="text-hostello-purple-light" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            <span className="text-sm text-ink-primary leading-snug flex-1">
                              {n.title}
                            </span>
                            {n.unread && (
                              <span
                                className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                                style={{ backgroundColor: "var(--color-hostello-gold)" }}
                              />
                            )}
                          </span>
                          {n.body && (
                            <span className="block text-xs text-ink-secondary truncate mt-0.5">
                              {n.body}
                            </span>
                          )}
                          <span className="block text-[11px] text-ink-muted mt-1">
                            {n.who ? `${n.who} · ` : ""}
                            {n.when}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            <Link
              href={allHref}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-xs text-center text-ink-secondary border-t border-border-hairline hover:text-ink-primary transition-colors"
            >
              View all notifications
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
