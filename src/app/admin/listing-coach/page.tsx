import Link from "next/link";
import { Sparkles, Star, Search, Tags, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { unitArt } from "@/lib/unit-tint";
import { formatDayMonth } from "@/lib/calendar";
import { againstMiddle, coachMoney, positionLabel } from "@/lib/listing-coach";
import { errorBanner, fieldInput, fieldLabel, noticeBanner } from "@/lib/form-styles";
import { PageHeader, EmptyState } from "@/components/shared/PageHeader";
import { SubmitButton } from "@/components/shared/Busy";
import { addCoachListing, setCoachWatching } from "./actions";

type Listing = {
  property_id: string;
  watching: boolean;
  properties: { name: string; city: string | null; photo_path: string | null; clients: { name: string } | null } | null;
};

type Report = {
  property_id: string;
  run_on: string;
  title: string | null;
  rating: number | null;
  review_count: number | null;
  weekend_usd: number | null;
  weekend_median_usd: number | null;
  usd_pkr: number | null;
  search_position: number | null;
  search_pages: number;
  position_change: number | null;
  price_flag: boolean;
};

const num = (v: unknown) => (v == null ? null : Number(v));

/**
 * The Airbnb listings being watched, each with its latest check. The checks
 * are not run from here: a scheduled Claude task reads Airbnb on the owner's
 * laptop and saves into `coach_reports`.
 */
export default async function ListingCoachPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;

  const supabase = await createClient();
  const [{ data: listingRows }, { data: reportRows }, { data: fixRows }, { data: unitRows }] = await Promise.all([
    supabase
      .from("coach_listings")
      .select("property_id, watching, properties:properties_v(name, city, photo_path, clients:clients_v(name))"),
    supabase
      .from("coach_reports")
      .select(
        "property_id, run_on, title, rating, review_count, weekend_usd, weekend_median_usd, usd_pkr, search_position, search_pages, position_change, price_flag"
      )
      .order("run_on", { ascending: false })
      .limit(200),
    supabase.from("coach_fixes").select("property_id").is("confirmed_on", null).is("done_at", null),
    supabase.from("properties_v").select("id, name, clients:clients_v(name)").eq("status", "active").order("name"),
  ]);

  const listings = ((listingRows ?? []) as unknown as Listing[]).sort((a, b) =>
    (a.properties?.name ?? "").localeCompare(b.properties?.name ?? "")
  );
  // Newest first, so the first report met for a unit is its latest.
  const latest = new Map<string, Report>();
  for (const r of (reportRows ?? []) as unknown as Report[]) {
    if (!latest.has(r.property_id)) latest.set(r.property_id, r);
  }
  const openFixes = new Map<string, number>();
  for (const f of fixRows ?? []) openFixes.set(f.property_id, (openFixes.get(f.property_id) ?? 0) + 1);

  const listed = new Set(listings.map((l) => l.property_id));
  const addable = ((unitRows ?? []) as unknown as { id: string; name: string; clients: { name: string } | null }[]).filter(
    (u) => !listed.has(u.id)
  );
  const lastRun = reportRows?.[0]?.run_on as string | undefined;

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Listing Coach"
        sub={lastRun ? `Last checked ${formatDayMonth(lastRun)}` : "Airbnb listings, checked every Thursday night"}
        info={
          <>
            <p>
              Every Thursday at 10 PM a task in the Claude app on your laptop opens each watched
              listing and its competitors on Airbnb and saves what it finds here: price against
              similar listings, place in search, and once a month a list of fixes with new titles.
            </p>
            <p className="mt-2">
              It only runs while that laptop is on with the Claude app open. If it was closed, the
              check runs the next time you open it, and you get an alert when one is waiting.
              Nothing here changes your Airbnb listing; you apply the fixes on Airbnb yourself.
            </p>
          </>
        }
      />
      {notice && <p className={noticeBanner}>{notice}</p>}
      {error && <p className={errorBanner}>{error}</p>}

      {listings.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={<>No listings yet.</>}
          body={<>Pick a unit below and paste its Airbnb link to start watching it.</>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {listings.map((l) => {
            const r = latest.get(l.property_id);
            const name = l.properties?.name ?? "Unit";
            const fixes = openFixes.get(l.property_id) ?? 0;
            const gap = r ? againstMiddle(num(r.weekend_usd), num(r.weekend_median_usd)) : null;
            return (
              <div key={l.property_id} className={`card overflow-hidden flex flex-col ${l.watching ? "" : "opacity-60"}`}>
                <Link href={`/admin/listing-coach/${l.property_id}`} className="flex flex-col card-hover">
                  <span className="block h-20" style={{ background: unitArt(name, l.properties?.photo_path) }} />
                  <span className="p-4 flex flex-col gap-2.5 min-w-0">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink-primary truncate">
                        {name}
                        <span className="text-ink-muted font-normal">
                          {" "}
                          · {[l.properties?.clients?.name, l.properties?.city].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="block text-xs text-ink-secondary truncate mt-0.5">
                        {r?.title ?? "No report yet. The first one comes with the next check."}
                      </span>
                    </span>
                    {r && (
                      <span className="grid grid-cols-2 gap-2 text-xs">
                        <span className="tile px-3 py-2 flex items-center gap-2 min-w-0">
                          <Star size={13} className="text-hostello-gold shrink-0" aria-hidden />
                          <span className="num text-ink-primary truncate">
                            {r.rating != null ? Number(r.rating).toFixed(2) : "New"}
                            <span className="text-ink-muted"> · {r.review_count ?? 0} reviews</span>
                          </span>
                        </span>
                        <span className="tile px-3 py-2 flex items-center gap-2 min-w-0">
                          <Search size={13} className="text-ink-muted shrink-0" aria-hidden />
                          <span className="num text-ink-primary truncate">
                            {positionLabel(r.search_position, r.search_pages)}
                            {r.position_change != null && r.position_change !== 0 && (
                              <span className={r.position_change > 0 ? "text-negative" : "text-positive"}>
                                {" "}
                                {r.position_change > 0 ? `↓${r.position_change}` : `↑${-r.position_change}`}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="tile px-3 py-2 flex items-center gap-2 min-w-0 col-span-2">
                          <Tags size={13} className={`shrink-0 ${r.price_flag ? "text-negative" : "text-ink-muted"}`} aria-hidden />
                          <span className="num text-ink-primary truncate">
                            {coachMoney(num(r.weekend_usd), num(r.usd_pkr))}
                            <span className={r.price_flag ? "text-negative" : "text-ink-muted"}>
                              {" "}
                              · weekend{gap ? `, ${gap}` : ""}
                            </span>
                          </span>
                        </span>
                      </span>
                    )}
                    <span className={`text-xs flex items-center gap-1.5 ${fixes > 0 ? "text-hostello-gold" : "text-ink-muted"}`}>
                      <Wrench size={12} aria-hidden />
                      {fixes === 0 ? "No open fixes" : fixes === 1 ? "1 fix to make" : `${fixes} fixes to make`}
                    </span>
                  </span>
                </Link>
                <form action={setCoachWatching} className="px-4 pb-4 mt-auto">
                  <input type="hidden" name="property_id" value={l.property_id} />
                  {!l.watching && <input type="hidden" name="watching" value="on" />}
                  <SubmitButton className="btn btn-ghost btn-sm" busy={l.watching ? "Pausing…" : "Turning on…"}>
                    {l.watching ? "Watching · pause" : "Paused · watch again"}
                  </SubmitButton>
                </form>
              </div>
            );
          })}
        </div>
      )}

      {addable.length > 0 && (
        <form action={addCoachListing} className="card p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-ink-primary">Watch another listing</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5 min-w-[11rem]">
              <label htmlFor="coach_unit" className={fieldLabel}>
                Unit
              </label>
              <select id="coach_unit" name="property_id" required defaultValue="" className={fieldInput}>
                <option value="" disabled>
                  Pick a unit
                </option>
                {addable.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.clients?.name ? ` · ${u.clients.name}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-[14rem]">
              <label htmlFor="coach_url" className={fieldLabel}>
                Its Airbnb link
              </label>
              <input
                id="coach_url"
                name="airbnb_url"
                required
                placeholder="airbnb.com/rooms/… or airbnb.com/h/…"
                className={fieldInput}
              />
            </div>
            <SubmitButton className="btn btn-gold btn-sm" busy="Adding the listing…">
              Watch
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
