import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default async function ClientsListPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, contact_email, contact_phone, properties(count)")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-ink-muted text-xs tracking-wide">PORTFOLIO</p>
          <h1 className="text-2xl font-semibold mt-1">Clients</h1>
        </div>
        <Link
          href="/admin/clients/new"
          className="rounded-md py-2 px-4 text-sm font-medium text-surface-0 flex items-center gap-1.5"
          style={{ backgroundColor: "var(--color-hostello-gold)" }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Add client
        </Link>
      </header>

      {(!clients || clients.length === 0) && (
        <div className="card p-10 text-center flex flex-col items-center gap-2">
          <p className="text-sm text-ink-secondary">No clients yet.</p>
          <p className="text-xs text-ink-muted">
            Add your first client to start managing their properties.
          </p>
        </div>
      )}

      {clients && clients.length > 0 && (
        <div className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
          {clients.map((c) => {
            const propCount =
              (c.properties as unknown as { count: number }[])?.[0]?.count ?? 0;
            return (
              <Link
                key={c.id}
                href={`/admin/clients/${c.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-surface-2 transition-colors group"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium text-ink-primary shrink-0"
                  style={{ backgroundColor: "var(--color-hostello-purple-mid)" }}
                >
                  {initials(c.name) || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-primary truncate">{c.name}</p>
                  <p className="text-xs text-ink-secondary truncate mt-0.5">
                    {c.contact_email || c.contact_phone || "No contact info"}
                  </p>
                </div>
                <div className="text-xs text-ink-secondary shrink-0">
                  {propCount} {propCount === 1 ? "property" : "properties"}
                </div>
                <ChevronRight
                  size={16}
                  className="text-ink-muted group-hover:text-ink-secondary transition-colors shrink-0"
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
