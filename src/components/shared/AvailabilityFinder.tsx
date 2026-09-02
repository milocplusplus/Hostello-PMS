"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { startNavProgress } from "@/components/shared/NavProgress";
import { Search, X } from "lucide-react";
import { PROVINCES, CITIES_BY_PROVINCE } from "@/lib/pakistan-locations";
import { PROPERTY_TYPES } from "@/lib/property-types";
import { fieldLabel, fieldInput, primaryButton } from "@/lib/form-styles";
import type { AvailabilityCriteria } from "@/lib/availability-search";

/**
 * The enquiry, as a form. It writes the URL and the server does the searching,
 * so a result set is a link someone can paste to a colleague.
 */
export function AvailabilityFinder({
  criteria,
  today,
}: {
  criteria: AvailabilityCriteria;
  /** Today from the server, so the min= attribute can't disagree on hydration. */
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [shortStay, setShortStay] = useState(criteria.stay.kind === "short");
  const [from, setFrom] = useState(
    criteria.stay.kind === "short" ? criteria.stay.date : criteria.stay.checkIn
  );
  const [to, setTo] = useState(criteria.stay.kind === "short" ? "" : criteria.stay.checkOut);
  const [guests, setGuests] = useState(criteria.guests?.toString() ?? "");
  const [rate, setRate] = useState(criteria.maxPerNight?.toString() ?? "");
  const [budget, setBudget] = useState(criteria.maxTotal?.toString() ?? "");
  const [province, setProvince] = useState(criteria.province);
  const [city, setCity] = useState(criteria.city);
  const [type, setType] = useState(criteria.type);

  // "Any province" means every city is fair game; picking one narrows the list.
  const cities = province ? CITIES_BY_PROVINCE[province] ?? [] : allCities();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (shortStay) params.set("stay", "short");
    params.set("from", from);
    if (!shortStay && to) params.set("to", to);
    for (const [key, value] of [
      ["guests", guests],
      ["rate", rate],
      ["budget", budget],
      ["province", province],
      ["city", city],
      ["type", type],
    ] as const) {
      if (value) params.set(key, value);
    }
    startNavProgress();
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className="card p-5 flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1.5">
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

        <div className="flex flex-col gap-1.5">
          <label htmlFor="from" className={fieldLabel}>
            {shortStay ? "Date" : "Check-in"}
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

        {shortStay ? (
          <div className="flex flex-col gap-1.5">
            <span className={fieldLabel}>Hours</span>
            <p className="text-xs text-ink-muted leading-tight pt-2">
              A short stay holds the whole date here, the same as it does on save. Pick the
              hours on the booking form.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
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
          <label htmlFor="rate" className={fieldLabel}>
            Max per night (PKR)
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

        <div className="flex flex-col gap-1.5">
          <label htmlFor="province" className={fieldLabel}>
            Province
          </label>
          <select
            id="province"
            value={province}
            onChange={(e) => {
              setProvince(e.target.value);
              setCity("");
            }}
            className={fieldInput}
          >
            <option value="">Any province</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="city" className={fieldLabel}>
            City
          </label>
          <select
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={fieldInput}
          >
            <option value="">Any city</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="type" className={fieldLabel}>
            Property type
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={fieldInput}
          >
            <option value="">Any type</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" className={primaryButton}>
          <Search size={14} />
          Find available
        </button>
        <button
          type="button"
          onClick={() => {
            setGuests("");
            setRate("");
            setBudget("");
            setProvince("");
            setCity("");
            setType("");
            startNavProgress();
            router.push(pathname);
          }}
          className="btn btn-ghost btn-sm"
        >
          <X size={14} />
          Clear filters
        </button>
      </div>
    </form>
  );
}

function allCities(): string[] {
  return [...new Set(Object.values(CITIES_BY_PROVINCE).flat())].sort();
}
