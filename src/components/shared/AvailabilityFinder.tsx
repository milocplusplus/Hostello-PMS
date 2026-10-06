"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { startNavProgress } from "@/components/shared/NavProgress";
import { CalendarRange, SlidersHorizontal, X } from "lucide-react";
import { addDaysISO } from "@/lib/calendar";
import { PROPERTY_TYPES } from "@/lib/property-types";
import { fieldLabel, fieldInput, primaryButton } from "@/lib/form-styles";
import type { AvailabilityCriteria, FinderOptions } from "@/lib/availability-search";

/** The enquiry as it sits in the URL — every field a string, blank meaning "any". */
type Query = {
  short: boolean;
  from: string;
  to: string;
  guests: string;
  rate: string;
  budget: string;
  city: string;
  type: string;
};

const PILL =
  "px-2.5 sm:px-3.5 h-10 flex items-center gap-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200";
const PILL_OFF = "text-ink-secondary hover:text-ink-primary hover:bg-white/5";

/**
 * The enquiry, as one-tap picks. Dates and city are links, so the page opens
 * on what is free tonight and a result set stays something a colleague can be
 * sent; the rarer requirements sit behind Filters.
 *
 * The pages key this on the criteria, so every navigation starts it afresh
 * from the URL and no field here can disagree with the results under it.
 */
export function AvailabilityFinder({
  criteria,
  today,
  options,
}: {
  criteria: AvailabilityCriteria;
  /** Today from the server, so the picks and min= can't disagree on hydration. */
  today: string;
  /** Where the units actually are — the menus offer nothing else. */
  options: FinderOptions;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const short = criteria.stay.kind === "short";
  const current: Query = {
    short,
    from: criteria.stay.kind === "short" ? criteria.stay.date : criteria.stay.checkIn,
    to: criteria.stay.kind === "short" ? "" : criteria.stay.checkOut,
    guests: criteria.guests?.toString() ?? "",
    rate: criteria.maxPerNight?.toString() ?? "",
    budget: criteria.maxTotal?.toString() ?? "",
    city: criteria.city,
    type: criteria.type,
  };

  function href(next: Partial<Query>) {
    const q = { ...current, ...next };
    const params = new URLSearchParams();
    if (q.short) params.set("stay", "short");
    params.set("from", q.from);
    if (!q.short && q.to) params.set("to", q.to);
    for (const key of ["guests", "rate", "budget", "city", "type"] as const) {
      if (q[key]) params.set(key, q[key]);
    }
    return `${pathname}?${params.toString()}`;
  }

  // A short stay is hours on one date, so its picks are days, not nights.
  const picks = short
    ? [
        { label: "Today", from: today, to: "" },
        { label: "Tomorrow", from: addDaysISO(today, 1), to: "" },
      ]
    : [
        { label: "Tonight", from: today, to: addDaysISO(today, 1) },
        { label: "Tomorrow", from: addDaysISO(today, 1), to: addDaysISO(today, 2) },
        { label: "Weekend", ...weekend(today) },
      ];
  const picked = picks.find((p) => p.from === current.from && p.to === current.to);

  const [datesOpen, setDatesOpen] = useState(!picked);
  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(current.to);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shortStay, setShortStay] = useState(short);
  const [guests, setGuests] = useState(current.guests);
  const [rate, setRate] = useState(current.rate);
  const [budget, setBudget] = useState(current.budget);
  const [type, setType] = useState(current.type);

  const types = PROPERTY_TYPES.filter((t) => options.types.includes(t.value));
  const filterCount = [current.guests, current.rate, current.budget, current.type, short].filter(
    Boolean
  ).length;

  function go(next: Partial<Query>) {
    startNavProgress();
    router.push(href(next));
  }

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="card flex items-center gap-1 p-1 rounded-2xl self-start max-w-full overflow-x-auto">
        {picks.map((p) => (
          <Link
            key={p.label}
            href={href({ from: p.from, to: p.to })}
            aria-current={!datesOpen && picked === p ? "true" : undefined}
            className={`${PILL} ${!datesOpen && picked === p ? "pill-active" : PILL_OFF}`}
          >
            {p.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setDatesOpen(true)}
          aria-pressed={datesOpen}
          className={`${PILL} ${datesOpen ? "pill-active" : PILL_OFF}`}
        >
          <CalendarRange size={14} />
          {short ? "Pick a date" : "Pick dates"}
        </button>
      </div>

      {datesOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go({ from, to });
          }}
          className="card p-4 flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1.5 flex-1 min-w-[9rem]">
            <label htmlFor="from" className={fieldLabel}>
              {short ? "Date" : "Check-in"}
            </label>
            <input
              id="from"
              type="date"
              required
              min={today}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={fieldInput}
            />
          </div>
          {!short && (
            <div className="flex flex-col gap-1.5 flex-1 min-w-[9rem]">
              <label htmlFor="to" className={fieldLabel}>
                Check-out
              </label>
              <input
                id="to"
                type="date"
                required
                min={from > today ? from : today}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={fieldInput}
              />
            </div>
          )}
          <button type="submit" className={primaryButton}>
            Show free units
          </button>
        </form>
      )}

      <div className="flex items-center gap-2">
        {/* One city is no choice: an owner with units in one place gets no chips. */}
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {options.cities.length > 1 &&
            ["", ...options.cities].map((c) => {
              const on = current.city === c;
              return (
                <Link
                  key={c || "all"}
                  href={href({ city: c })}
                  aria-current={on ? "true" : undefined}
                  className={`rounded-full border px-3.5 py-1.5 text-xs whitespace-nowrap transition-all ${
                    on
                      ? "border-hostello-gold bg-hostello-gold/15 text-ink-primary font-semibold"
                      : "border-border-hairline text-ink-secondary hover:border-border-strong hover:text-ink-primary"
                  }`}
                >
                  {c || "All cities"}
                </Link>
              );
            })}
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          className="btn btn-ghost btn-sm shrink-0"
        >
          <SlidersHorizontal size={14} />
          Filters
          {filterCount > 0 && (
            <span className="num text-[10px] font-extrabold px-1.5 rounded-full bg-hostello-gold text-surface-0">
              {filterCount}
            </span>
          )}
        </button>
      </div>

      {filtersOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Switching between nights and hours changes what the dates mean, so
            // it starts again from today rather than carrying a check-out over.
            const dates =
              shortStay === short
                ? {}
                : { from: today, to: shortStay ? "" : addDaysISO(today, 1) };
            go({ short: shortStay, guests, rate, budget, type, ...dates });
          }}
          className="card p-4 flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="guests" className={fieldLabel}>
                Guests
              </label>
              <input
                id="guests"
                type="number"
                min="1"
                placeholder="Any"
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                className={fieldInput}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="type" className={fieldLabel}>
                Unit type
              </label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={fieldInput}
              >
                <option value="">Any type</option>
                {types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="rate" className={fieldLabel}>
                {shortStay ? "Max price (PKR)" : "Max per night (PKR)"}
              </label>
              <input
                id="rate"
                type="number"
                min="0"
                step="500"
                placeholder="Any"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className={fieldInput}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="budget" className={fieldLabel}>
                Max total (PKR)
              </label>
              <input
                id="budget"
                type="number"
                min="0"
                step="1000"
                placeholder="Any"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className={fieldInput}
              />
            </div>

            <div className="flex flex-col gap-1.5 col-span-2 lg:col-span-1">
              <label htmlFor="stay" className={fieldLabel}>
                Stay
              </label>
              <select
                id="stay"
                value={shortStay ? "short" : "nightly"}
                onChange={(e) => setShortStay(e.target.value === "short")}
                className={fieldInput}
              >
                <option value="nightly">Nightly</option>
                <option value="short">Short stay (hours)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" className={primaryButton}>
              Apply
            </button>
            {filterCount > 0 && (
              <Link
                href={href({
                  short: false,
                  guests: "",
                  rate: "",
                  budget: "",
                  type: "",
                  ...(short ? { from: today, to: addDaysISO(today, 1) } : {}),
                })}
                className="btn btn-ghost btn-sm"
              >
                <X size={14} />
                Clear filters
              </Link>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * Friday to Sunday, two nights. On a Saturday the weekend is already under
 * way, so it is tonight only.
 */
function weekend(today: string): { from: string; to: string } {
  const day = new Date(today + "T00:00:00Z").getUTCDay();
  if (day === 6) return { from: today, to: addDaysISO(today, 1) };
  const friday = addDaysISO(today, (5 - day + 7) % 7);
  return { from: friday, to: addDaysISO(friday, 2) };
}
