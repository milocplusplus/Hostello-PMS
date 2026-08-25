import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { secondaryButton } from "@/lib/form-styles";
import {
  formatNotificationTime,
  notificationHref,
  notificationIcon,
} from "@/lib/notifications";
import { markAllReadAdmin, markOneReadAdmin } from "./actions";

type Row = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  booking_id: string | null;
  property_id: string | null;
  admin_read_at: string | null;
  created_at: string;
  clients: unknown;
};

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const unreadOnly = filter === "unread";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let query = supabase
    .from("notifications")
    .select(
      "id, kind, title, body, booking_id, property_id, admin_read_at, created_at, clients(name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (unreadOnly) query = query.is("admin_read_at", null);

  const [{ data: notifications }, { count: unreadCount }] = await Promise.all([
    query,
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .is("admin_read_at", null),
  ]);

  const rows = (notifications ?? []) as unknown as Row[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-ink-muted text-xs tracking-wide">OVERVIEW</p>
          <h1 className="text-2xl font-semibold mt-1">Activity</h1>
          <p className="text-sm text-ink-secondary mt-1.5">
            Every booking, cancellation, block and payout across the portfolio.
          </p>
        </div>
        {(unreadCount ?? 0) > 0 && (
          <form action={markAllReadAdmin}>
            <button type="submit" className={secondaryButton}>
              Mark all read
            </button>
          </form>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {[
          { key: "", label: "All" },
          { key: "unread", label: `Unread${unreadCount ? ` (${unreadCount})` : ""}` },
        ].map((t) => {
          const active = t.key === (unreadOnly ? "unread" : "");
          return (
            <Link
              key={t.label}
              href={t.key ? "/admin/notifications?filter=unread" : "/admin/notifications"}
              className={`text-xs rounded-md px-3 py-1.5 border transition-colors ${
                active
                  ? "bg-surface-3 border-border-strong text-ink-primary"
                  : "border-border-hairline text-ink-secondary hover:border-border-strong"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="card p-12 text-center flex flex-col items-center gap-2">
          <Bell size={20} className="text-ink-muted" />
          <p className="text-sm text-ink-secondary">
            {unreadOnly ? "Nothing unread." : "Nothing yet."}
          </p>
          <p className="text-xs text-ink-muted">
            Activity appears here as bookings are made and dates change.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
          {rows.map((n) => {
            const Icon = notificationIcon(n.kind);
            const unread = !n.admin_read_at;
            const who = (n.clients as { name: string } | null)?.name ?? null;
            return (
              <div
                key={n.id}
                className={`flex gap-3.5 px-4 py-3.5 ${unread ? "bg-surface-2/40" : ""}`}
              >
                <span className="w-8 h-8 rounded-md bg-surface-3 flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-hostello-purple-light" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={notificationHref(n, "admin")}
                    className="text-sm text-ink-primary hover:text-hostello-gold transition-colors"
                  >
                    {n.title}
                  </Link>
                  {n.body && <p className="text-xs text-ink-secondary mt-0.5">{n.body}</p>}
                  <p className="text-[11px] text-ink-muted mt-1.5">
                    {who ? `${who} · ` : ""}
                    {formatNotificationTime(n.created_at)}
                  </p>
                </div>
                {unread && (
                  <form action={markOneReadAdmin} className="shrink-0">
                    <input type="hidden" name="id" value={n.id} />
                    <button
                      type="submit"
                      className="text-[11px] text-ink-muted hover:text-ink-primary transition-colors"
                    >
                      Mark read
                    </button>
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
