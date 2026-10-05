import Link from "next/link";
import { Images } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { unitArt } from "@/lib/unit-tint";
import { PageHeader, EmptyState } from "@/components/shared/PageHeader";

type UnitRow = {
  id: string;
  name: string;
  city: string | null;
  photo_path: string | null;
  clients: { name: string } | null;
};

/**
 * Every unit and how many photos it has. For both staff roles: ops cannot open
 * the client pages (they carry deal terms), and this page carries none.
 */
export default async function PhotosPage() {
  const supabase = await createClient();

  const [{ data: units }, { data: photoRows }] = await Promise.all([
    supabase
      .from("properties_v")
      .select("id, name, city, photo_path, clients:clients_v(name)")
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {rows.map((u) => {
            const count = counts.get(u.id) ?? 0;
            return (
              <Link key={u.id} href={`/admin/photos/${u.id}`} className="card card-hover overflow-hidden flex flex-col">
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
      )}
    </div>
  );
}
