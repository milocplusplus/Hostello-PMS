import Link from "next/link";
import { ChevronRight, CircleCheck, ExternalLink, Sparkles, X } from "lucide-react";
import { formatDayMonth } from "@/lib/calendar";
import { formatPKR } from "@/lib/payout";
import { FIX_AREAS, againstMiddle, pricedHigh, type CoachCompetitor } from "@/lib/listing-coach";
import { errorBanner, fieldInput, fieldLabel, noticeBanner } from "@/lib/form-styles";
import { PageHeader, EmptyState } from "@/components/shared/PageHeader";
import { SubmitButton } from "@/components/shared/Busy";
import { CopyLinkButton } from "@/components/admin/CopyLinkButton";
import { addCoachCompetitor, removeCoachCompetitor, tickCoachFix } from "@/app/admin/listing-coach/actions";

export type CoachReport = {
  id: string;
  run_on: string;
  title: string | null;
  rating: number | null;
  review_count: number | null;
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

export type CoachFix = {
  id: string;
  area: string;
  issue: string;
  fix: string;
  done_at: string | null;
  confirmed_on: string | null;
  reopened_on: string | null;
};

export type CoachCompetitorRow = { id: string; airbnb_url: string; title: string | null; source: string };

export const COACH_TABS = ["overview", "fixes", "wording", "competitors", "history"] as const;
export type CoachTab = (typeof COACH_TABS)[number];

const TAB_LABEL: Record<CoachTab, string> = {
  overview: "Overview",
  fixes: "Fixes",
  wording: "Wording",
  competitors: "Competitors",
  history: "History",
};

const num = (v: unknown) => (v == null ? null : Number(v));
const dollars = (v: number | null) => (v == null ? "—" : `$${Math.round(v)}`);

/**
 * One watched listing, a tab at a time: the page was one long scroll of text
 * before, and the owner asked for less to take in at once.
 */
export function CoachListing({
  propertyId,
  unitName,
  clientName,
  airbnbUrl,
  reports,
  fixes,
  competitors,
  tab,
  error,
  notice,
}: {
  propertyId: string;
  unitName: string;
  clientName?: string | null;
  airbnbUrl: string;
  reports: CoachReport[];
  fixes: CoachFix[];
  competitors: CoachCompetitorRow[];
  tab: CoachTab;
  error?: string;
  notice?: string;
}) {
  const latest = reports[0];
  // The titles and description come from the monthly audit, not every week.
  const audit = reports.find((r) => r.audited);
  const open = fixes.filter((f) => !f.confirmed_on && !f.done_at);
  const ticked = fixes.filter((f) => !f.confirmed_on && f.done_at);
  const confirmed = fixes.filter((f) => f.confirmed_on).length;
  const rate = latest ? num(latest.usd_pkr) : null;
  const seen = new Map((latest?.competitors ?? []).map((c) => [c.url, c]));

  const tabs = COACH_TABS.filter((t) => t !== "history" || reports.length > 1);
  const active = tabs.includes(tab) ? tab : "overview";
  const count: Partial<Record<CoachTab, number>> = { fixes: open.length, competitors: competitors.length };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      <PageHeader
        title={unitName}
        sub={latest ? `Checked ${formatDayMonth(latest.run_on)}` : clientName}
        back={{ href: "/admin/listing-coach", label: "Listing Coach" }}
        info={
          <>
            <p>
              Prices are what Airbnb showed a visitor on the day of the check, for two nights
              {rate ? `, turned into rupees at ${rate.toFixed(2)} to the dollar` : ""}. The middle
              price is the one half the competitors are above and half below.
            </p>
            <p className="mt-2">
              Search position is for the coming weekend. It differs a little from one visitor to the
              next, so read it as a trend. Tick a fix when you have made the change on Airbnb; the
              next monthly audit checks it.
            </p>
          </>
        }
        actions={
          <a href={airbnbUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
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
          <div className="card flex items-center gap-1 p-1 rounded-2xl self-start max-w-full overflow-x-auto">
            {tabs.map((t) => (
              <Link
                key={t}
                href={t === "overview" ? `/admin/listing-coach/${propertyId}` : `/admin/listing-coach/${propertyId}?tab=${t}`}
                aria-current={active === t ? "page" : undefined}
                className={`px-3.5 h-10 flex items-center gap-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 ${
                  active === t ? "pill-active" : "text-ink-secondary hover:text-ink-primary hover:bg-white/5"
                }`}
              >
                {TAB_LABEL[t]}
                {count[t] ? <span className="num opacity-70">{count[t]}</span> : null}
              </Link>
            ))}
          </div>

          {active === "overview" && (
            <>
              {open[0] ? (
                <section className="card-hero p-5 md:p-6 flex flex-col gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/75">
                    Do this next · {FIX_AREAS[open[0].area] ?? open[0].area}
                  </p>
                  <p className="text-base md:text-lg font-bold leading-snug">{open[0].fix}</p>
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-white/75 w-fit">Why</summary>
                    <p className="text-sm text-white/90 mt-1.5">{open[0].issue}</p>
                  </details>
                  <div className="flex items-center gap-3 flex-wrap mt-1">
                    <form action={tickCoachFix}>
                      <input type="hidden" name="property_id" value={propertyId} />
                      <input type="hidden" name="id" value={open[0].id} />
                      <input type="hidden" name="done" value="on" />
                      <input type="hidden" name="tab" value="overview" />
                      <SubmitButton className="btn btn-gold btn-sm">Done</SubmitButton>
                    </form>
                    {open.length > 1 && (
                      <Link
                        href={`/admin/listing-coach/${propertyId}?tab=fixes`}
                        className="text-xs font-bold text-white/85 hover:text-white"
                      >
                        {open.length - 1} more {open.length === 2 ? "fix" : "fixes"} →
                      </Link>
                    )}
                  </div>
                </section>
              ) : (
                <section className="card p-5 flex items-center gap-3">
                  <CircleCheck size={20} className="text-positive shrink-0" aria-hidden />
                  <p className="text-sm font-semibold text-ink-primary">
                    Nothing to fix right now.
                    <span className="block text-xs font-normal text-ink-secondary">The next audit looks again.</span>
                  </p>
                </section>
              )}

              <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="tile px-4 py-3">
                  <p className="text-[11px] text-ink-muted">Rating</p>
                  <p className="num text-2xl font-extrabold text-ink-primary">
                    {latest.rating != null ? Number(latest.rating).toFixed(2) : "New"}
                  </p>
                  <p className="text-[11px] text-ink-secondary">
                    {latest.review_count === 1 ? "1 review" : `${latest.review_count ?? 0} reviews`}
                  </p>
                </div>
                <div className="tile px-4 py-3">
                  <p className="text-[11px] text-ink-muted">Search position</p>
                  <p className="num text-2xl font-extrabold text-ink-primary">
                    {latest.search_pages === 0
                      ? "—"
                      : latest.search_position != null
                        ? `#${latest.search_position}`
                        : `${latest.search_pages * 18}+`}
                  </p>
                  <p
                    className={`text-[11px] ${
                      (latest.position_change ?? 0) > 0
                        ? "text-negative"
                        : (latest.position_change ?? 0) < 0
                          ? "text-positive"
                          : "text-ink-secondary"
                    }`}
                  >
                    {latest.search_pages === 0
                      ? "Not checked"
                      : !latest.position_change
                        ? "Coming weekend"
                        : latest.position_change > 0
                          ? `Down ${latest.position_change}`
                          : `Up ${-latest.position_change}`}
                  </p>
                </div>
                <div className="tile px-4 py-3 col-span-2 md:col-span-1">
                  <p className="text-[11px] text-ink-muted">Weekend, 2 nights</p>
                  <p className="num text-2xl font-extrabold text-ink-primary">
                    {latest.weekend_usd == null
                      ? "—"
                      : rate
                        ? formatPKR(Math.round(Number(latest.weekend_usd) * rate))
                        : dollars(num(latest.weekend_usd))}
                  </p>
                  <p
                    className={`text-[11px] ${
                      pricedHigh(num(latest.weekend_usd), num(latest.weekend_median_usd))
                        ? "text-negative"
                        : "text-ink-secondary"
                    }`}
                  >
                    {latest.weekend_usd == null
                      ? "Not available on those dates"
                      : [
                          rate ? dollars(num(latest.weekend_usd)) : null,
                          againstMiddle(num(latest.weekend_usd), num(latest.weekend_median_usd)),
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No competitor prices yet"}
                  </p>
                </div>
              </section>

              <PriceBars report={latest} />

              {audit?.summary && (
                <details className="card px-4 md:px-5 py-3 group">
                  <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center gap-2 text-xs font-bold text-ink-secondary">
                    <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden />
                    The audit in a few lines
                  </summary>
                  <p className="text-sm text-ink-primary mt-2.5">{audit.summary}</p>
                </details>
              )}
            </>
          )}

          {active === "fixes" && (
            <section className="card overflow-hidden">
              {confirmed > 0 && (
                <p className="px-4 md:px-5 py-2.5 border-b border-border-hairline text-[11px] text-positive">
                  {confirmed} confirmed fixed by an audit
                </p>
              )}
              {open.length === 0 && ticked.length === 0 ? (
                <p className="px-4 md:px-5 py-4 text-sm text-ink-secondary">
                  Nothing open. The next audit looks again.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-border-hairline)]">
                  {[...open, ...ticked].map((f) => (
                    <li key={f.id} className={`px-4 md:px-5 py-3 flex items-start gap-3 ${f.done_at ? "opacity-60" : ""}`}>
                      <details className="group min-w-0 flex-1">
                        <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-start gap-2">
                          <ChevronRight
                            size={14}
                            className="mt-[3px] shrink-0 text-ink-muted transition-transform group-open:rotate-90"
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11px] font-bold text-hostello-gold">
                              {FIX_AREAS[f.area] ?? f.area}
                              {f.done_at ? (
                                <span className="text-ink-muted font-normal"> · ticked, waiting for the audit</span>
                              ) : (
                                f.reopened_on && (
                                  <span className="text-negative font-normal">
                                    {" "}
                                    · still there on {formatDayMonth(f.reopened_on)}
                                  </span>
                                )
                              )}
                            </span>
                            <span className="block text-sm text-ink-primary truncate group-open:whitespace-normal">
                              {f.issue}
                            </span>
                          </span>
                        </summary>
                        <p className="text-sm text-ink-secondary mt-2 ml-[22px]">
                          <span className="font-bold text-ink-primary">What to do: </span>
                          {f.fix}
                        </p>
                      </details>
                      <form action={tickCoachFix} className="shrink-0">
                        <input type="hidden" name="property_id" value={propertyId} />
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="tab" value="fixes" />
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

          {active === "wording" &&
            (!audit || (audit.title_options.length === 0 && !audit.suggested_description) ? (
              <EmptyState icon={Sparkles} title={<>No suggested wording yet.</>} body={<>It comes with the monthly audit.</>} />
            ) : (
              <section className="card p-4 md:p-5 flex flex-col gap-4">
                <p className="text-[11px] text-ink-muted">From the audit on {formatDayMonth(audit.run_on)}</p>
                {audit.title_options.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h2 className="text-sm font-semibold text-ink-primary">Title, pick one</h2>
                    {audit.title_options.map((t) => (
                      <div key={t} className="tile px-3 py-2.5 flex items-center justify-between gap-3">
                        <span className="text-sm text-ink-primary min-w-0">{t}</span>
                        <CopyLinkButton value={t} className="btn btn-ghost btn-sm shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
                {audit.suggested_description && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold text-ink-primary">Description</h2>
                      <CopyLinkButton value={audit.suggested_description} className="btn btn-ghost btn-sm shrink-0" />
                    </div>
                    <details className="tile px-3 py-2.5 group">
                      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-start gap-2">
                        <ChevronRight
                          size={14}
                          className="mt-[3px] shrink-0 text-ink-muted transition-transform group-open:rotate-90"
                          aria-hidden
                        />
                        <span className="text-sm text-ink-primary truncate group-open:hidden">
                          {audit.suggested_description.split("\n")[0]}
                        </span>
                        <span className="text-xs font-bold text-ink-secondary hidden group-open:inline">Hide</span>
                      </summary>
                      <p className="text-sm text-ink-primary whitespace-pre-wrap mt-2.5">{audit.suggested_description}</p>
                    </details>
                  </div>
                )}
              </section>
            ))}

          {active === "competitors" && (
            <section className="card overflow-hidden">
              {competitors.length === 0 ? (
                <p className="px-4 md:px-5 py-4 text-sm text-ink-secondary">None yet. The next check picks five.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table w-full text-sm">
                    <thead>
                      <tr className="text-left text-ink-muted text-xs border-b border-border-hairline">
                        <th className="px-4 md:px-5 py-2.5 font-normal">Listing</th>
                        <th className="px-3 py-2.5 font-normal text-right">Weekend</th>
                        <th className="px-3 py-2.5 font-normal text-right hidden sm:table-cell">Weekday</th>
                        <th className="pl-1 pr-3 md:pr-5 py-2.5 font-normal text-right">&nbsp;</th>
                      </tr>
                    </thead>
                    <tbody>
                      {competitors.map((c) => {
                        const s = seen.get(c.airbnb_url);
                        return (
                          <tr key={c.id} className="border-b border-border-hairline last:border-0">
                            <td className="px-4 md:px-5 py-3">
                              <a href={c.airbnb_url} target="_blank" rel="noreferrer" className="block min-w-0">
                                <span className="block text-ink-primary truncate max-w-[11rem] sm:max-w-[18rem] md:max-w-[22rem]">
                                  {c.title ?? "Airbnb listing"}
                                </span>
                                <span className="block text-xs text-ink-secondary">
                                  {s?.rating != null
                                    ? `${Number(s.rating).toFixed(2)} · ${s.reviews ?? 0} reviews`
                                    : s
                                      ? "New"
                                      : "Not in the last check"}
                                </span>
                              </a>
                            </td>
                            <td className="px-3 py-3 text-right num text-ink-primary whitespace-nowrap">
                              {dollars(num(s?.weekend_usd))}
                            </td>
                            <td className="px-3 py-3 text-right num text-ink-primary whitespace-nowrap hidden sm:table-cell">
                              {dollars(num(s?.weekday_usd))}
                            </td>
                            <td className="pl-1 pr-3 md:pr-5 py-3 text-right">
                              <form action={removeCoachCompetitor}>
                                <input type="hidden" name="property_id" value={propertyId} />
                                <input type="hidden" name="id" value={c.id} />
                                <SubmitButton className="btn btn-ghost btn-sm" ariaLabel="Remove this competitor" title="Remove">
                                  <X size={14} aria-hidden />
                                </SubmitButton>
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
          )}

          {active === "history" && (
            <section className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table w-full text-sm">
                  <thead>
                    <tr className="text-left text-ink-muted text-xs border-b border-border-hairline">
                      <th className="px-4 md:px-5 py-2.5 font-normal">Checked</th>
                      <th className="px-3 py-2.5 font-normal text-right">Weekend</th>
                      <th className="px-3 py-2.5 font-normal text-right">Middle</th>
                      <th className="px-3 py-2.5 font-normal text-right">Search</th>
                      <th className="px-4 md:px-5 py-2.5 font-normal text-right hidden sm:table-cell">Reviews</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id} className="border-b border-border-hairline last:border-0">
                        <td className="px-4 md:px-5 py-3 text-ink-primary whitespace-nowrap">
                          {formatDayMonth(r.run_on)}
                          {r.audited && <span className="text-[11px] text-hostello-gold"> · audit</span>}
                        </td>
                        <td
                          className={`px-3 py-3 text-right num whitespace-nowrap ${r.price_flag ? "text-negative" : "text-ink-primary"}`}
                        >
                          {dollars(num(r.weekend_usd))}
                        </td>
                        <td className="px-3 py-3 text-right num text-ink-secondary whitespace-nowrap">
                          {dollars(num(r.weekend_median_usd))}
                        </td>
                        <td className="px-3 py-3 text-right num text-ink-secondary whitespace-nowrap">
                          {r.search_pages === 0 ? "—" : (r.search_position ?? `${r.search_pages * 18}+`)}
                        </td>
                        <td className="px-4 md:px-5 py-3 text-right num text-ink-secondary whitespace-nowrap hidden sm:table-cell">
                          {r.review_count ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/**
 * This listing's weekend price beside each competitor's, cheapest first. One
 * measure on one scale; the tick in every row is the competitors' middle price.
 */
function PriceBars({ report }: { report: CoachReport }) {
  const mine = num(report.weekend_usd);
  const middle = num(report.weekend_median_usd);
  const rows = [
    ...(mine != null ? [{ key: "mine", label: "This listing", usd: mine, mine: true, hint: "" }] : []),
    ...report.competitors
      .filter((c) => c.weekend_usd != null)
      .map((c) => ({
        key: c.url,
        label: c.title ?? "Airbnb listing",
        usd: Number(c.weekend_usd),
        mine: false,
        hint: c.rating != null ? ` · ${Number(c.rating).toFixed(2)} · ${c.reviews ?? 0} reviews` : " · new",
      })),
  ].sort((a, b) => a.usd - b.usd);
  // One row is not a comparison.
  if (rows.length < 2) return null;

  const max = Math.max(...rows.map((r) => r.usd));
  const weekdayGap = againstMiddle(num(report.weekday_usd), num(report.weekday_median_usd));

  return (
    <section className="card p-4 md:p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink-primary">Weekend price</h2>
        {middle != null && (
          <p className="text-[11px] text-ink-muted flex items-center gap-1.5 shrink-0">
            <span aria-hidden className="inline-block w-px h-3 bg-white/50" />
            Middle {dollars(middle)}
          </p>
        )}
      </div>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li
            key={r.key}
            title={`${r.label}${r.hint} · ${dollars(r.usd)} for two nights`}
            className="grid grid-cols-[minmax(0,6.5rem)_1fr_2.75rem] sm:grid-cols-[minmax(0,12rem)_1fr_3rem] gap-x-3 items-center"
          >
            <span className={`text-xs truncate ${r.mine ? "font-bold text-ink-primary" : "text-ink-secondary"}`}>
              {r.label}
            </span>
            <span className="relative h-7">
              <span
                className={`absolute left-0 top-1/2 -translate-y-1/2 h-2.5 rounded-r-[4px] ${
                  r.mine ? "bg-hostello-gold" : "bg-white/25"
                }`}
                style={{ width: `${(r.usd / max) * 100}%` }}
              />
              {middle != null && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 w-px bg-white/50"
                  style={{ left: `${(middle / max) * 100}%` }}
                />
              )}
            </span>
            <span className={`num text-xs text-right ${r.mine ? "font-bold text-ink-primary" : "text-ink-secondary"}`}>
              {dollars(r.usd)}
            </span>
          </li>
        ))}
      </ul>
      {report.weekday_usd != null && (
        <p className="text-[11px] text-ink-muted">
          Weekday: {dollars(num(report.weekday_usd))}
          {weekdayGap ? `, ${weekdayGap}` : ""}.
        </p>
      )}
    </section>
  );
}
