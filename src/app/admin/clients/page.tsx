import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ChevronRight, Search, X, SearchX, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { Avatar } from "@/components/shared/Avatar";
import { DEAL_MODELS, formatPKR } from "@/lib/payout";
import { todayISO } from "@/lib/calendar";
import { PageHeader, EmptyState } from "@/components/shared/PageHeader";

function dealModelLabel(value: string) {
  return DEAL_MODELS.find((m) => m.value === value)?.label ?? value;
}

export default async function ClientsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const term = q.trim();

  const supabase = await createClient();

  const user = await currentUser();
  if (!user) redirect("/login");

  let clientQuery = supabase
    .from("clients")
    .select("id, name, contact_email, contact_phone, deal_model, deactivated_at, properties(count)")
    .order("name");

  if (term) {
    // PostgREST parses `or()` as a comma-separated list, so those characters
    // can't survive inside the pattern.
    const pattern = "%" + term.replace(/[,()]/g, " ") + "%";
    clientQuery = clientQuery.or(
      `name.ilike.${pattern},contact_email.ilike.${pattern},contact_phone.ilike.${pattern}`
    );
  }

  const today = todayISO();

  // Live workload per client: bookings that haven't checked out yet, and what
  // Hostello is still owed on them. Both come from rows that already exist —
  // nothing here is projected.
  const [{ data: clients }, { data: openBookings }] = await Promise.all([
    clientQuery,
    supabase
      .from("bookings_v")
      .select("client_id, due_to_hostello, share_received")
      .neq("status", "cancelled")
      .gte("check_out", today),
  ]);

  // A deactivated client keeps its history and its page, under its own heading.
  const active = (clients ?? []).filter((c) => !c.deactivated_at);
  const deactivated = (clients ?? []).filter((c) => c.deactivated_at);

  const activity = (openBookings ?? []).reduce<Record<string, { count: number; awaiting: number }>>(
    (acc, b) => {
      const entry = (acc[b.client_id] ??= { count: 0, awaiting: 0 });
      entry.count += 1;
      if (!b.share_received) entry.awaiting += Number(b.due_to_hostello ?? 0);
      return acc;
    },
    {}
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clients"
        actions={
          <Link
            href="/admin/clients/new"
            aria-label="Add client"
            className="btn btn-primary h-11 w-11 md:w-auto p-0 md:px-4 rounded-2xl"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span className="hidden md:inline">Add client</span>
          </Link>
        }
      />

      <form action="/admin/clients" className="relative w-full sm:w-72">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, email or phone…"
          aria-label="Search clients"
          className="field w-full pl-8 pr-8"
        />
        {term && (
          <Link
            href="/admin/clients"
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-primary transition-colors"
          >
            <X size={14} />
          </Link>
        )}
      </form>

      {(!clients || clients.length === 0) && (
        term ? (
          <EmptyState
            icon={SearchX}
            title={<>No clients match “{term}”.</>}
            action={
              <Link href="/admin/clients" className="text-xs text-hostello-gold hover:underline">
                Clear search
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No clients yet."
            body="Add your first client to start managing their properties."
          />
        )
      )}

      {[
        { list: active, heading: null },
        { list: deactivated, heading: "Deactivated" },
      ].map(({ list, heading }) =>
        list.length === 0 ? null : (
          <section key={heading ?? "active"} className="flex flex-col gap-2">
            {heading && (
              <h2 className="text-sm font-semibold tracking-tight text-ink-muted">{heading}</h2>
            )}
            <div
              className={`card divide-y divide-[var(--color-border-hairline)] overflow-hidden ${
                heading ? "opacity-60" : ""
              }`}
            >
              {list.map((c) => {
                const propCount =
                  (c.properties as unknown as { count: number }[])?.[0]?.count ?? 0;
                const stats = activity[c.id];
                return (
                  <Link
                    key={c.id}
                    href={`/admin/clients/${c.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-surface-2 transition-colors group"
                  >
                    <Avatar name={c.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink-primary truncate">{c.name}</p>
                      <p className="text-xs text-ink-secondary truncate mt-0.5">
                        {c.contact_email || c.contact_phone || "No contact info"}
                        <span className="text-ink-muted"> · {dealModelLabel(c.deal_model)}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-xs text-ink-secondary">
                        {propCount} {propCount === 1 ? "property" : "properties"}
                      </p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {stats
                          ? `${stats.count} ${stats.count === 1 ? "booking" : "bookings"} open`
                          : "No open bookings"}
                      </p>
                    </div>
                    <div className="text-right shrink-0 w-24 hidden md:block">
                      {stats && stats.awaiting > 0 ? (
                        <>
                          <p className="text-xs text-status-pending">{formatPKR(stats.awaiting)}</p>
                          <p className="text-[10px] text-ink-muted mt-0.5">awaiting</p>
                        </>
                      ) : (
                        <p className="text-xs text-ink-muted">—</p>
                      )}
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-ink-muted group-hover:text-ink-secondary transition-colors shrink-0"
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        )
      )}

      {clients && clients.length > 0 && (
        <p className="text-xs text-ink-muted">
          {clients.length} {clients.length === 1 ? "client" : "clients"}
          {term ? ` matching “${term}”` : ""}
        </p>
      )}
    </div>
  );
}
