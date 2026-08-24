import { redirect } from "next/navigation";
import { CalendarDays, CalendarX2, Lock, Wallet, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { markAllRead, markOneRead } from "./actions";
import { secondaryButton } from "@/lib/form-styles";

const KIND_ICON = {
  booking_created: CalendarDays,
  booking_cancelled: CalendarX2,
  dates_blocked: Lock,
  dates_unblocked: Lock,
  payout_settled: Wallet,
} as const;

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  });
}

export default async function ClientNotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();
  if (!clientRecord) redirect("/client");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, kind, title, body, read_at, created_at")
    .eq("client_id", clientRecord.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const unreadCount = (notifications ?? []).filter((n) => !n.read_at).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-ink-muted text-xs tracking-wide">UPDATES</p>
          <h1 className="text-2xl font-semibold mt-1">Notifications</h1>
        </div>
        {unreadCount > 0 && (
          <form action={markAllRead}>
            <button type="submit" className={secondaryButton}>
              Mark all read
            </button>
          </form>
        )}
      </div>

      {(!notifications || notifications.length === 0) && (
        <div className="card p-12 text-center flex flex-col items-center gap-2">
          <Bell size={20} className="text-ink-muted" />
          <p className="text-sm text-ink-secondary">Nothing yet.</p>
          <p className="text-xs text-ink-muted">
            You&apos;ll hear from us when a booking comes in or dates change.
          </p>
        </div>
      )}

      {notifications && notifications.length > 0 && (
        <div className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
          {notifications.map((n) => {
            const Icon = KIND_ICON[n.kind as keyof typeof KIND_ICON] ?? Bell;
            const unread = !n.read_at;
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-5 py-4 ${unread ? "bg-hostello-gold/5" : ""}`}
              >
                <Icon
                  size={16}
                  className={`shrink-0 mt-0.5 ${unread ? "text-hostello-gold" : "text-ink-muted"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${unread ? "text-ink-primary" : "text-ink-secondary"}`}>
                    {n.title}
                  </p>
                  {n.body && <p className="text-xs text-ink-muted mt-0.5">{n.body}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-ink-muted">
                    {formatWhen(n.created_at)}
                  </span>
                  {unread && (
                    <form action={markOneRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <button
                        type="submit"
                        className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
                      >
                        Mark read
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
