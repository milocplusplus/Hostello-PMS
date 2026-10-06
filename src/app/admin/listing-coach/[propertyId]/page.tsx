import { notFound } from "next/navigation";
import { ExternalLink, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDayMonth } from "@/lib/calendar";
import {
  FIX_AREAS,
  againstMiddle,
  coachMoney,
  positionLabel,
  pricedHigh,
  type CoachCompetitor,
} from "@/lib/listing-coach";
import { errorBanner, fieldInput, fieldLabel, noticeBanner } from "@/lib/form-styles";
import { PageHeader, EmptyState } from "@/components/shared/PageHeader";
import { SubmitButton } from "@/components/shared/Busy";
import { CopyLinkButton } from "@/components/admin/CopyLinkButton";
import { addCoachCompetitor, removeCoachCompetitor, tickCoachFix } from "../actions";

type Report = {
  id: string;
  run_on: string;
  title: string | null;
  rating: number | null;
  review_count: number | null;
  photo_count: number | null;
  weekend_from: string | null;
  weekend_usd: number | null;
  weekend_median_usd: number | null;
  weekday_from: string | null;
  weekday_usd: number | null;
  weekday_median_usd: number | null;
  usd_pkr: number | null;
  search_position: number | null;
  search_pages: number;
  position_change: number | null;
  price_flag: boolean;
  competitors: CoachCompetitor[];
  audited: boolean;
  summary: string | null;
  title_options: string[];
  suggested_description: string | null;
};

type Fix = {
  id: string;
  area: string;
  issue: string;
  fix: string;
  found_on: string;
  done_at: string | null;
  confirmed_on: string | null;
  reopened_on: string | null;
};

type Competitor = { id: string; airbnb_url: string; title: string | null; source: string };

const num = (v: unknown) => (v == null ? null : Number(v));

export default async function CoachListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { propertyId } = await params;
  const { error, notice } = await searchParams;

  const supabase = await createClient();
  const [{ data: listing }, { data: reportRows }, { data: fixRows }, { data: competitorRows }] = await Promise.all([
    supabase
      .from("coach_listings")
      .select("property_id, airbnb_url, properties:properties_v(name, clients:clients_v(name))")
      .eq("property_id", propertyId)
      .maybeSingle(),
    supabase
      .from("coach_reports")
      .select("*")
      .eq("property_id", propertyId)
      .order("run_on", { ascending: false })
      .limit(26),
    supabase
      .from("coach_fixes")
      .select("id, area, issue, fix, found_on, done_at, confirmed_on, reopened_on")
      .eq("property_id", propertyId)
      .order("created_at"),
    supabase
      .from("coach_competitors")
      .select("id, airbnb_url, title, source")
      .eq("property_id", propertyId)
      .order("created_at"),
  ]);
  if (!listing) notFound();

  const unit = listing.properties as unknown as { name: string; clients: { name: string } | null } | null;
  const reports = (reportRows ?? []) as unknown as Report[];
  const latest = reports[0];
  // The titles and description come from the monthly audit, not every week.
  const audit = reports.find((r) => r.audited);
  const fixes = (fixRows ?? []) as Fix[];
  const open = fixes.filter((f) => !f.confirmed_on && !f.done_at);
  const ticked = fixes.filter((f) => !f.confirmed_on && f.done_at);
  const confirmed = fixes.filter((f) => f.confirmed_on).length;
  const competitors = (competitorRows ?? []) as Competitor[];
  const rate = latest ? num(latest.usd_pkr) : null;
  const prices = new Map((latest?.competitors ?? []).map((c) => [c.url, c]));

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <PageHeader
        title={unit?.name ?? "Listing"}
        sub={latest?.title ?? unit?.clients?.name}
        back={{ href: "/admin/listing-coach", label: "Listing Coach" }}
        actions={
          <a href={listing.airbnb_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            <ExternalLink size={13} aria-hidden />
            Airbnb
          </a>
        }
      />
      {notice && <p className={noticeBanner}>{notice}</p>}
      {error && <p className={errorBanner}>{error}</p>}

      {!latest ? (
        <EmptyState
          icon={Sparkles}
          title={<>No report yet.</>}
          body={<>The first one is saved by the next Thursday check.</>}
        />
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="tile px-4 py-3">
              <p className="text-[11px] text-ink-muted">Rating</p>
              <p className="num text-lg font-bold text-ink-primary">
                {latest.rating != null ? Number(latest.rating).toFixed(2) : "New"}
              </p>
              <p className="text-[11px] text-ink-secondary">{latest.review_count ?? 0} reviews</p>
            </div>
            <div className="tile px-4 py-3">
              <p className="text-[11px] text-ink-muted">Search, coming weekend</p>
              <p className="num text-lg font-bold text-ink-primary">
                {positionLabel(latest.search_position, latest.search_pages)}
              </p>
              <p className="text-[11px] text-ink-secondary">
                {latest.position_change == null || latest.position_change === 0
                  ? "No change to compare"
                  : latest.position_change > 0
                    ? `Down ${latest.position_change} since the last check`
                    : `Up ${-latest.position_change} since the last check`}
              </p>
            </div>
            {(
              [
                ["Weekend", latest.weekend_from, latest.weekend_usd, latest.weekend_median_usd],
                ["Weekday", latest.weekday_from, latest.weekday_usd, latest.weekday_median_usd],
              ] as const
            ).map(([label, from, usd, middle]) => {
              const gap = againstMiddle(num(usd), num(middle));
              const high = pricedHigh(num(usd), num(middle));
              return (
                <div key={label} className="tile px-4 py-3">
                  <p className="text-[11px] text-ink-muted">
                    {label}, 2 nights{from ? ` from ${formatDayMonth(from)}` : ""}
                  </p>
                  <p className="num text-lg font-bold text-ink-primary">{coachMoney(num(usd), rate)}</p>
                  <p className={`text-[11px] ${high ? "text-negative" : "text-ink-secondary"}`}>
                    {gap ?? (usd == null ? "Not available on those dates" : "No competitor prices yet")}
                  </p>
                </div>
              );
            })}
          </section>
          <p className="text-[11px] text-ink-muted -mt-3">
            Checked {formatDayMonth(latest.run_on)}. Prices are what Airbnb showed a visitor that day
            {rate ? `, in rupees at ${rate.toFixed(2)} to the dollar` : ", in dollars"}. Search position differs a
            little from one visitor to the next; read it as a trend.
          </p>
        </>
      )}

      {(open.length > 0 || ticked.length > 0 || confirmed > 0) && (
        <section className="card overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-border-hairline flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink-primary">Fixes</h2>
            {confirmed > 0 && <p className="text-[11px] text-positive">{confirmed} confirmed fixed</p>}
          </div>
          {open.length === 0 && ticked.length === 0 ? (
            <p className="px-4 md:px-5 py-4 text-xs text-ink-secondary">Nothing open. The next audit looks again.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border-hairline)]">
              {[...open, ...ticked].map((f) => (
                <li key={f.id} className={`px-4 md:px-5 py-3 flex items-start gap-3 ${f.done_at ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-hostello-gold">{FIX_AREAS[f.area] ?? f.area}</p>
                    <p className="text-sm text-ink-primary mt-0.5">{f.issue}</p>
                    <p className="text-xs text-ink-secondary mt-1">{f.fix}</p>
                    {f.done_at ? (
                      <p className="text-[11px] text-ink-muted mt-1">Ticked done. The next audit checks it on Airbnb.</p>
                    ) : (
                      f.reopened_on && (
                        <p className="text-[11px] text-negative mt-1">
                          Ticked done before, but the audit on {formatDayMonth(f.reopened_on)} still found it.
                        </p>
                      )
                    )}
                  </div>
                  <form action={tickCoachFix} className="shrink-0">
                    <input type="hidden" name="property_id" value={propertyId} />
                    <input type="hidden" name="id" value={f.id} />
                    {!f.done_at && <input type="hidden" name="done" value="on" />}
                    <SubmitButton className={f.done_at ? "btn btn-ghost btn-sm" : "btn btn-gold btn-sm"}>
                      {f.done_at ? "Undo" : "Done"}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {audit && (audit.title_options.length > 0 || audit.suggested_description || audit.summary) && (
        <section className="card p-4 md:p-5 flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink-primary">Suggested wording</h2>
            <p className="text-[11px] text-ink-muted mt-0.5">From the audit on {formatDayMonth(audit.run_on)}</p>
          </div>
          {audit.summary && <p className="text-xs text-ink-secondary">{audit.summary}</p>}
          {audit.title_options.length > 0 && (
            <ul className="flex flex-col gap-2">
              {audit.title_options.map((t) => (
                <li key={t} className="tile px-3 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-primary min-w-0">
                    {t} <span className="num text-[11px] text-ink-muted">· {t.length}/50</span>
                  </span>
                  <CopyLinkButton value={t} className="btn btn-ghost btn-sm shrink-0" />
                </li>
              ))}
            </ul>
          )}
          {audit.suggested_description && (
            <div className="tile px-3 py-3 flex flex-col gap-2.5">
              <p className="text-xs text-ink-primary whitespace-pre-wrap">{audit.suggested_description}</p>
              <CopyLinkButton
                value={audit.suggested_description}
                className="btn btn-ghost btn-sm self-start"
                label="Copy description"
              />
            </div>
          )}
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
          <h2 className="text-sm font-semibold text-ink-primary">Competitors</h2>
          <p className="text-[11px] text-ink-muted mt-0.5">
            The first check picks five similar listings. Remove any that are not real rivals and add your own.
          </p>
        </div>
        {competitors.length === 0 ? (
          <p className="px-4 md:px-5 py-4 text-xs text-ink-secondary">None yet. The next check picks them.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm">
              <thead>
                <tr className="text-left text-ink-muted text-xs border-b border-border-hairline">
                  <th className="px-4 md:px-5 py-2.5 font-normal">Listing</th>
                  <th className="px-4 py-2.5 font-normal text-right">Weekend</th>
                  <th className="px-4 py-2.5 font-normal text-right hidden sm:table-cell">Weekday</th>
                  <th className="px-4 md:px-5 py-2.5 font-normal text-right">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c) => {
                  const seen = prices.get(c.airbnb_url);
                  return (
                    <tr key={c.id} className="border-b border-border-hairline last:border-0">
                      <td className="px-4 md:px-5 py-3">
                        <a href={c.airbnb_url} target="_blank" rel="noreferrer" className="block min-w-0">
                          <span className="block text-ink-primary truncate max-w-[16rem] md:max-w-[24rem]">
                            {c.title ?? "Airbnb listing"}
                          </span>
                          <span className="block text-xs text-ink-secondary">
                            {seen?.rating != null
                              ? `${Number(seen.rating).toFixed(2)} · ${seen.reviews ?? 0} reviews`
                              : seen
                                ? "New, no rating yet"
                                : "Not in the last check"}
                            {c.source === "staff" ? " · added by you" : ""}
                          </span>
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right num text-ink-primary whitespace-nowrap">
                        {seen?.weekend_usd != null ? `$${Math.round(seen.weekend_usd)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right num text-ink-primary whitespace-nowrap hidden sm:table-cell">
                        {seen?.weekday_usd != null ? `$${Math.round(seen.weekday_usd)}` : "—"}
                      </td>
                      <td className="px-4 md:px-5 py-3 text-right">
                        <form action={removeCoachCompetitor}>
                          <input type="hidden" name="property_id" value={propertyId} />
                          <input type="hidden" name="id" value={c.id} />
                          <SubmitButton className="btn btn-ghost btn-sm">Remove</SubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <form
          action={addCoachCompetitor}
          className="px-4 md:px-5 py-4 border-t border-border-hairline flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="property_id" value={propertyId} />
          <div className="flex flex-col gap-1.5 flex-1 min-w-[14rem]">
            <label htmlFor="competitor_url" className={fieldLabel}>
              Add a competitor&apos;s Airbnb link
            </label>
            <input
              id="competitor_url"
              name="airbnb_url"
              required
              placeholder="airbnb.com/rooms/…"
              className={fieldInput}
            />
          </div>
          <SubmitButton className="btn btn-gold btn-sm" busy="Adding the competitor…">
            Add
          </SubmitButton>
        </form>
      </section>

      {reports.length > 1 && (
        <section className="card overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
            <h2 className="text-sm font-semibold text-ink-primary">History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm">
              <thead>
                <tr className="text-left text-ink-muted text-xs border-b border-border-hairline">
                  <th className="px-4 md:px-5 py-2.5 font-normal">Checked</th>
                  <th className="px-4 py-2.5 font-normal text-right">Weekend</th>
                  <th className="px-4 py-2.5 font-normal text-right">Middle price</th>
                  <th className="px-4 py-2.5 font-normal text-right">Search</th>
                  <th className="px-4 md:px-5 py-2.5 font-normal text-right">Reviews</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-border-hairline last:border-0">
                    <td className="px-4 md:px-5 py-3 text-ink-primary whitespace-nowrap">
                      {formatDayMonth(r.run_on)}
                      {r.audited && <span className="text-[11px] text-hostello-gold"> · audit</span>}
                    </td>
                    <td className={`px-4 py-3 text-right num whitespace-nowrap ${r.price_flag ? "text-negative" : "text-ink-primary"}`}>
                      {r.weekend_usd != null ? `$${Math.round(Number(r.weekend_usd))}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right num text-ink-secondary whitespace-nowrap">
                      {r.weekend_median_usd != null ? `$${Math.round(Number(r.weekend_median_usd))}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right num text-ink-secondary whitespace-nowrap">
                      {r.search_pages === 0 ? "—" : (r.search_position ?? `${r.search_pages * 18}+`)}
                    </td>
                    <td className="px-4 md:px-5 py-3 text-right num text-ink-secondary whitespace-nowrap">
                      {r.review_count ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
