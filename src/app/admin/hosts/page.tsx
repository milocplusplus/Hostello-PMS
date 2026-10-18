import Link from "next/link";
import { ChevronRight, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/shared/Avatar";
import { HealthChip } from "@/components/admin/HealthChip";
import { EmptyState, PageHeader } from "@/components/shared/PageHeader";
import { subscriptionHealth, type HostSubscription } from "@/lib/hosts";
import { formatDayMonth } from "@/lib/calendar";

type HostRow = {
  id: string;
  name: string;
  contact_email: string | null;
  created_at: string;
  subscriptions: HostSubscription | HostSubscription[] | null;
  properties: { count: number }[];
};

export default async function HostsPage() {
  const supabase = await createClient();

  const [{ data: hosts }, { data: plans }, { data: open }] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, name, contact_email, created_at, subscriptions(plan_key, billing_period, status, trial_ends_at, current_period_end, comped, note), properties(count)"
      )
      .eq("account_type", "host")
      .order("created_at", { ascending: false }),
    supabase.from("plans").select("key, name, max_listings"),
    supabase.rpc("host_signup_open"),
  ]);

  const planOf = new Map((plans ?? []).map((p) => [p.key, p]));
  const rows = (hosts ?? []) as unknown as HostRow[];
  const subOf = (h: HostRow) => (Array.isArray(h.subscriptions) ? h.subscriptions[0] : h.subscriptions) ?? null;

  const counts = { trial: 0, active: 0, lapsed: 0 };
  for (const h of rows) {
    const s = subOf(h);
    if (!s) continue;
    if (s.status === "trial") counts.trial++;
    else if (s.status === "active") counts.active++;
    else counts.lapsed++;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hosts"
        sub={`${rows.length} ${rows.length === 1 ? "host" : "hosts"} · ${counts.trial} on trial · ${counts.active} paying · ${counts.lapsed} lapsed`}
        info={
          <p>
            Self-serve accounts: people who signed up themselves and manage their own properties.
            Your managed clients are under Clients &amp; Properties.
          </p>
        }
        actions={
          <Link href="/admin/settings#host-signups" className="btn btn-ghost btn-sm">
            Sign-ups: {open ? "open" : "closed"}
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No hosts yet."
          body={open ? "Sign-ups are open. New hosts appear here." : "Sign-ups are closed. Open them in Settings when you are ready."}
        />
      ) : (
        <div className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
          {rows.map((h) => {
            const s = subOf(h);
            const plan = s ? planOf.get(s.plan_key) : null;
            const units = h.properties?.[0]?.count ?? 0;
            return (
              <Link
                key={h.id}
                href={`/admin/hosts/${h.id}`}
                className="px-5 py-4 flex items-center gap-4 hover:bg-white/[0.03] transition-colors"
              >
                <Avatar name={h.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-primary truncate">{h.name}</p>
                  <p className="text-[11px] text-ink-muted truncate">
                    {h.contact_email ?? "No email"} · joined {formatDayMonth(h.created_at.slice(0, 10))}
                  </p>
                </div>
                <div className="hidden sm:block text-right text-xs text-ink-secondary">
                  <p>{plan ? plan.name : "—"}</p>
                  <p className="text-ink-muted">
                    {units}
                    {plan ? ` of ${plan.max_listings}` : ""} {units === 1 ? "property" : "properties"}
                  </p>
                </div>
                <HealthChip health={subscriptionHealth(s)} />
                <ChevronRight size={16} className="text-ink-muted shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
