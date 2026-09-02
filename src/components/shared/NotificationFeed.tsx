import Link from "next/link";
import { Bell } from "lucide-react";
import {
  CATEGORIES,
  notificationIcon,
  type NotificationCategory,
  type NotificationItem,
} from "@/lib/notifications";
import { markAllNotificationsRead, markNotificationRead } from "@/app/notifications/actions";
import { secondaryButton } from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";

/**
 * The notification list, shared by both portals. The only differences between
 * them are the base path and whether a row names the client it is about, so
 * they are props rather than a second copy of this file.
 */
export function NotificationFeed({
  items,
  unreadCount,
  basePath,
  unreadOnly,
  category,
}: {
  items: NotificationItem[];
  unreadCount: number;
  basePath: string;
  unreadOnly: boolean;
  category?: NotificationCategory;
}) {
  function href(next: { unread?: boolean; category?: NotificationCategory | null }) {
    const params = new URLSearchParams();
    const wantUnread = next.unread ?? unreadOnly;
    const wantCategory = next.category === null ? undefined : (next.category ?? category);
    if (wantUnread) params.set("filter", "unread");
    if (wantCategory) params.set("category", wantCategory);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const chip = (active: boolean) =>
    `text-xs rounded-md px-3 py-1.5 border transition-colors ${
      active
        ? "bg-surface-3 border-border-strong text-ink-primary"
        : "border-border-hairline text-ink-secondary hover:border-border-strong"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Link href={href({ unread: false })} className={chip(!unreadOnly)}>
          All
        </Link>
        <Link href={href({ unread: true })} className={chip(unreadOnly)}>
          Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
        </Link>
        <span className="w-px h-5 bg-border-hairline mx-1" aria-hidden />
        <Link href={href({ category: null })} className={chip(!category)}>
          Everything
        </Link>
        {CATEGORIES.map((c) => (
          <Link key={c.key} href={href({ category: c.key })} className={chip(category === c.key)}>
            {c.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="card p-8 md:p-12 text-center flex flex-col items-center gap-2">
          <Bell size={20} className="text-ink-muted" />
          <p className="text-sm text-ink-secondary">
            {unreadOnly ? "Nothing unread." : category ? "Nothing in this category yet." : "Nothing yet."}
          </p>
          <p className="text-xs text-ink-muted">
            Activity appears here as bookings, payments and dates change.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
          {items.map((n) => {
            const Icon = notificationIcon(n.kind);
            const critical = n.category === "critical";
            return (
              <div
                key={n.id}
                className={`flex gap-3 px-4 py-3.5 ${n.unread ? "bg-surface-2/40" : ""}`}
              >
                <span
                  className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                    critical ? "bg-status-booked/15" : "bg-surface-3"
                  }`}
                >
                  <Icon
                    size={14}
                    className={critical ? "text-status-booked" : "text-hostello-purple-light"}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={n.href}
                    className="text-sm text-ink-primary hover:text-hostello-gold transition-colors"
                  >
                    {n.title}
                  </Link>
                  {n.body && <p className="text-xs text-ink-secondary mt-0.5">{n.body}</p>}
                  <p className="text-[11px] text-ink-muted mt-1.5">
                    {n.who ? `${n.who} · ` : ""}
                    {n.when}
                  </p>
                </div>
                {n.unread && (
                  <form action={markNotificationRead} className="shrink-0">
                    <input type="hidden" name="id" value={n.id} />
                    <SubmitButton
                      className="text-[11px] text-ink-muted hover:text-ink-primary transition-colors"
                      busy="Marking it read…"
                    >
                      Mark read
                    </SubmitButton>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** "Mark all read" — rendered next to the page heading, hidden when there is nothing to clear. */
export function MarkAllReadButton({ unreadCount }: { unreadCount: number }) {
  if (unreadCount === 0) return null;
  return (
    <form action={markAllNotificationsRead}>
      <SubmitButton className={secondaryButton} busy="Marking everything read…">
        Mark all read
      </SubmitButton>
    </form>
  );
}
