import Link from "next/link";
import { Images } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { unitArt } from "@/lib/unit-tint";
import { PROPERTY_TYPES } from "@/lib/property-types";
import { PageHeader, EmptyState } from "@/components/shared/PageHeader";

type UnitRow = {
  id: string;
  name: string;
  city: string | null;
  type: string | null;
  photo_path: string | null;
  clients: { name: string } | null;
};

const VIEWS = [
  { key: "all", label: "All units" },
  { key: "type", label: "By room type" },
  { key: "client", label: "By client" },
] as const;
type View = (typeof VIEWS)[number]["key"];

/** The units under one heading each, for the two grouped views. */
function grouped(rows: UnitRow[], view: View): { label: string | null; units: UnitRow[] }[] {
  if (view === "all") return [{ label: null, units: rows }];

  if (view === "type") {
    // In the order the type list gives, not A-Z: Studio before 1 BHK before 2 BHK.
    const known = PROPERTY_TYPES.map((t) => ({
      label: t.label as string,
      units: rows.filter((u) => u.type === t.value),
    }));
    const rest = rows.filter((u) => !PROPERTY_TYPES.some((t) => t.value === u.type));
    return [...known, { label: "No type set", units: rest }].filter((g) => g.units.length > 0);
  }

  const byClient = new Map<string, UnitRow[]>();
  for (const u of rows) {
    const name = u.clients?.name ?? "No client";
    byClient.set(name, [...(byClient.get(name) ?? []), u]);
  }
  return [...byClient.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, units]) => ({ label, units }));
}

/**
 * Every unit and how many photos it has. For both staff roles: ops cannot open
 * the client pages (they carry deal terms), and this page carries none.
 */
export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: asked } = await searchParams;
  const view: View = VIEWS.find((v) => v.key === asked)?.key ?? "all";

  const supabase = await createClient();

  const [{ data: units }, { data: photoRows }] = await Promise.all([
    supabase
      .from("properties_v")
      .select("id, name, city, type, photo_path, clients:clients_v(name)")
      .order("name"),
    supabase.from("property_photos").select("property_id"),
  ]);

  const rows = (units ?? []) as unknown as UnitRow[];
  const counts = new Map<string, number>();
  for (const p of photoRows ?? []) counts.set(p.property_id, (counts.get(p.property_id) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Photos"
        info={
          <p>
            Each unit&apos;s pictures, grouped by room. Open a unit to add photos, pick its cover, or
            save and share them with a guest.
          </p>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={Images} title={<>No units yet.</>} />
      ) : (
        <>
          <div className="card flex items-center gap-1 p-1 rounded-2xl self-start max-w-full overflow-x-auto">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={v.key === "all" ? "/admin/photos" : `/admin/photos?view=${v.key}`}
                aria-current={view === v.key ? "page" : undefined}
                className={`px-3.5 h-10 flex items-center rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 ${
                  view === v.key ? "pill-active" : "text-ink-secondary hover:text-ink-primary hover:bg-white/5"
                }`}
              >
                {v.label}
              </Link>
            ))}
          </div>

          {grouped(rows, view).map((g) => (
            <section key={g.label ?? "all"} className="flex flex-col gap-2.5">
              {g.label && (
                <h2 className="text-sm font-semibold text-ink-secondary">
                  {g.label} <span className="num text-ink-muted font-normal">· {g.units.length}</span>
                </h2>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {g.units.map((u) => {
                  const count = counts.get(u.id) ?? 0;
                  return (
                    <Link
                      key={u.id}
                      href={`/admin/photos/${u.id}`}
                      className="card card-hover overflow-hidden flex flex-col"
                    >
                      <span className="block h-24" style={{ background: unitArt(u.name, u.photo_path) }} />
                      <span className="p-3 flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-semibold text-ink-primary truncate">{u.name}</span>
                        <span className="text-[11px] text-ink-muted truncate">
                          {[u.clients?.name, u.city].filter(Boolean).join(" · ")}
                        </span>
                        <span className={`num text-xs mt-1 ${count > 0 ? "text-hostello-gold" : "text-ink-muted"}`}>
                          {count === 0 ? "No photos yet" : count === 1 ? "1 photo" : `${count} photos`}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
