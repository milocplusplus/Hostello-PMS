import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, isAuditCategory, loadAudit } from "@/lib/audit";
import { AuditTrail } from "@/components/admin/AuditTrail";
import { AuditFilters } from "@/components/admin/AuditFilters";
import { PageHeader } from "@/components/shared/PageHeader";

type Search = {
  actor?: string;
  client?: string;
  property?: string;
  type?: string;
  from?: string;
  to?: string;
  before?: string;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireOwner();
  const sp = await searchParams;
  const category = isAuditCategory(sp.type) ? sp.type : undefined;
  const from = sp.from && DAY.test(sp.from) ? sp.from : "";
  const to = sp.to && DAY.test(sp.to) ? sp.to : "";
  const before = Number(sp.before) || undefined;

  const supabase = await createClient();

  const [{ entries, more, alsoRemoved }, { data: clients }, { data: units }, { data: actors }] =
    await Promise.all([
      loadAudit(supabase, {
        actor: sp.actor,
        client: sp.client,
        property: sp.property,
        category,
        from,
        to,
        before,
        hideCascaded: true,
      }),
      supabase.from("clients_v").select("id, name").order("name"),
      sp.client
        ? supabase.from("properties_v").select("id, name").eq("client_id", sp.client).order("name")
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      // Everyone who has ever appeared, including logins since deleted.
      supabase
        .from("audit_log")
        .select("actor_id, actor_name, actor_role")
        .not("actor_id", "is", null)
        .order("id", { ascending: false })
        .limit(2000),
    ]);

  const people = new Map<string, string>();
  for (const a of actors ?? []) {
    if (!people.has(a.actor_id)) {
      people.set(a.actor_id, `${a.actor_name ?? "Unknown"} (${ROLE_LABEL[a.actor_role] ?? a.actor_role})`);
    }
  }

  const clientNames = new Map((clients ?? []).map((c) => [c.id as string, c.name as string]));

  const olderParams = new URLSearchParams(
    Object.entries(sp).filter(([k, v]) => k !== "before" && v) as [string, string][]
  );
  const newestHref = `/admin/audit?${olderParams.toString()}`;
  if (entries.length > 0) olderParams.set("before", String(entries[entries.length - 1].id));

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      <PageHeader
        title="Audit log"
        sub="Every change, who made it and when"
        info={
          <>
            <p>
              Bookings, blocks, payments, receipts, clients, units, logins and sign-ins are recorded
              by the database itself the moment they change, whoever or whatever changed them.
              &quot;System&quot; is the channel sync and the nightly jobs.
            </p>
            <p className="mt-2">
              Nobody can edit or delete an entry, you included. Tap an entry to see exactly what
              changed.
            </p>
          </>
        }
      />

      <AuditFilters
        people={[{ id: "system", name: "System" }, ...[...people].map(([id, name]) => ({ id, name }))]}
        clients={(clients ?? []) as { id: string; name: string }[]}
        units={(units ?? []) as { id: string; name: string }[]}
        actor={sp.actor ?? ""}
        client={sp.client ?? ""}
        property={sp.property ?? ""}
        category={category ?? ""}
        from={from}
        to={to}
      />

      <AuditTrail
        entries={entries}
        alsoRemoved={alsoRemoved}
        clientNames={clientNames}
        empty={before ? "No older entries." : "Nothing matches these filters yet."}
      />

      {(more || before) && (
        <div className="flex items-center justify-between">
          {before ? (
            <Link href={newestHref} className="btn btn-ghost btn-sm">
              Back to newest
            </Link>
          ) : (
            <span />
          )}
          {more && (
            <Link href={`/admin/audit?${olderParams.toString()}`} className="btn btn-ghost btn-sm">
              Older
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
