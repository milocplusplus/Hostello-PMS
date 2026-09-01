import type { SupabaseClient } from "@supabase/supabase-js";
import { listUnavailable } from "./availability";
import { nightsBetween } from "./payout";
import { addDaysISO, todayISO } from "./calendar";
import { shortStayCheckOut } from "./short-stay";

/**
 * "What have we got free on the 5th for four people under 30k?"
 *
 * The finder answers an enquiry instead of a date. It is deliberately built on
 * `listUnavailable()` rather than its own query: whatever this offers has to be
 * bookable, and `findStayClash()` is what decides that on save. One source for
 * occupied nights means the two can't drift and quote a unit that is gone.
 *
 * Requirements are matched against `max_guests` / `nightly_rate` /
 * `short_stay_rate` — the guest-facing columns. Never `stack_rate`, which is
 * the owner's floor in a stack deal, blanked for ops, and not a price anyone
 * quotes.
 */

/** A stay is either nights, or hours on one date. Both occupy whole dates. */
export type StayShape =
  | { kind: "nightly"; checkIn: string; checkOut: string }
  | { kind: "short"; date: string };

export type AvailabilityCriteria = {
  stay: StayShape;
  guests: number | null;
  /** PKR ceiling on the per-night rate. For a short stay, on its flat rate. */
  maxPerNight: number | null;
  /** PKR ceiling on what the whole stay comes to. */
  maxTotal: number | null;
  province: string;
  city: string;
  type: string;
};

/** Which requirement a unit has no data to answer — not a failure, a blank. */
export type MissingDetail = "capacity" | "price";

export type AvailabilityMatch = {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  location: string;
  city: string | null;
  province: string | null;
  type: string;
  maxGuests: number | null;
  /** Per night, or the flat price of one short-stay window. */
  rate: number | null;
  /** What the whole stay comes to, when the rate is known. */
  total: number | null;
  missing: MissingDetail[];
};

export type AvailabilityResult = {
  nights: number;
  /** Free, and answers every requirement that was set. */
  matches: AvailabilityMatch[];
  /** Free, but missing the figure a requirement asked about. */
  needsDetails: AvailabilityMatch[];
  /** Free, but a requirement ruled them out. Counted, not listed. */
  ruledOut: number;
  /** Free on those dates before any requirement was applied. */
  freeOnDates: number;
};

type PropertyRow = {
  id: string;
  name: string;
  client_id: string;
  location: string;
  city: string | null;
  province: string | null;
  type: string;
  max_guests: number | null;
  nightly_rate: number | null;
  short_stay_rate: number | null;
  clients: unknown;
};

/** The nights a stay occupies, both ends inclusive — the shape ranges compare in. */
export function stayNights(stay: StayShape): { first: string; last: string; nights: number } {
  if (stay.kind === "short") {
    return { first: stay.date, last: stay.date, nights: 1 };
  }
  return {
    first: stay.checkIn,
    last: addDaysISO(stay.checkOut, -1),
    nights: nightsBetween(stay.checkIn, stay.checkOut),
  };
}

/** The `check_out` this stay would be written with, for the booking hand-off. */
export function stayCheckOut(stay: StayShape): string {
  return stay.kind === "short" ? shortStayCheckOut(stay.date) : stay.checkOut;
}

export async function findAvailable(
  supabase: SupabaseClient,
  criteria: AvailabilityCriteria
): Promise<AvailabilityResult> {
  const { first, last, nights } = stayNights(criteria.stay);
  const empty: AvailabilityResult = {
    nights,
    matches: [],
    needsDetails: [],
    ruledOut: 0,
    freeOnDates: 0,
  };
  if (nights < 1) return empty;

  // The view's WHERE clause is the access rule, so an owner's session only ever
  // sees their own units here — no client filter needed on our side.
  let query = supabase
    .from("properties_v")
    .select(
      "id, name, client_id, location, city, province, type, max_guests, nightly_rate, short_stay_rate, clients:clients_v(name)"
    )
    .eq("status", "active");

  if (criteria.province) query = query.eq("province", criteria.province);
  if (criteria.city) query = query.eq("city", criteria.city);
  if (criteria.type) query = query.eq("type", criteria.type);

  const { data } = await query.order("name");
  const properties = (data ?? []) as unknown as PropertyRow[];
  if (properties.length === 0) return empty;

  const occupied = await listUnavailable(
    supabase,
    properties.map((p) => p.id),
    { from: first }
  );

  // Both ends inclusive on both sides, which is what `listUnavailable` already
  // normalised the booking/block asymmetry into.
  const taken = new Set(
    occupied.filter((r) => r.start <= last && r.end >= first).map((r) => r.propertyId)
  );

  const matches: AvailabilityMatch[] = [];
  const needsDetails: AvailabilityMatch[] = [];
  let ruledOut = 0;
  let freeOnDates = 0;

  for (const p of properties) {
    if (taken.has(p.id)) continue;
    freeOnDates++;

    const rawRate = criteria.stay.kind === "short" ? p.short_stay_rate : p.nightly_rate;
    const rate = rawRate === null || rawRate === undefined ? null : Number(rawRate);
    // A short stay is priced flat per window, the same way its stack rate is.
    const total = rate === null ? null : criteria.stay.kind === "short" ? rate : rate * nights;

    const missing: MissingDetail[] = [];
    let excluded = false;

    if (criteria.guests !== null) {
      if (p.max_guests === null) missing.push("capacity");
      else if (p.max_guests < criteria.guests) excluded = true;
    }

    const wantsPrice = criteria.maxPerNight !== null || criteria.maxTotal !== null;
    if (wantsPrice) {
      if (rate === null) missing.push("price");
      else {
        if (criteria.maxPerNight !== null && rate > criteria.maxPerNight) excluded = true;
        if (criteria.maxTotal !== null && (total ?? 0) > criteria.maxTotal) excluded = true;
      }
    }

    if (excluded) {
      ruledOut++;
      continue;
    }

    const match: AvailabilityMatch = {
      id: p.id,
      name: p.name,
      clientId: p.client_id,
      clientName: (p.clients as { name: string } | null)?.name ?? "—",
      location: p.location,
      city: p.city,
      province: p.province,
      type: p.type,
      maxGuests: p.max_guests,
      rate,
      total,
      missing,
    };

    if (missing.length > 0) needsDetails.push(match);
    else matches.push(match);
  }

  matches.sort(byPriceThenName);
  needsDetails.sort(byPriceThenName);

  return { nights, matches, needsDetails, ruledOut, freeOnDates };
}

/** What the finder reads out of the URL. Both portals parse through here. */
export type FinderParams = {
  stay?: string;
  from?: string;
  to?: string;
  guests?: string;
  rate?: string;
  budget?: string;
  province?: string;
  city?: string;
  type?: string;
};

/** Blank, zero and nonsense all mean "no ceiling" — not a ceiling of nothing. */
function positive(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function readCriteria(params: FinderParams): AvailabilityCriteria {
  const today = todayISO();
  const from = params.from && params.from >= today ? params.from : today;
  const kind = params.stay === "short" ? "short" : "nightly";

  // A one-night stay is the floor; an end on or before the start is a typo, not
  // a search, so it is nudged rather than returning a confusing nothing.
  const to = params.to && params.to > from ? params.to : addDaysISO(from, 1);

  return {
    stay: kind === "short" ? { kind: "short", date: from } : { kind: "nightly", checkIn: from, checkOut: to },
    guests: positive(params.guests),
    maxPerNight: positive(params.rate),
    maxTotal: positive(params.budget),
    province: params.province ?? "",
    city: params.city ?? "",
    type: params.type ?? "",
  };
}

/** Cheapest first, because that is the order an enquiry gets answered in. */
function byPriceThenName(a: AvailabilityMatch, b: AvailabilityMatch): number {
  if (a.total !== b.total) {
    if (a.total === null) return 1;
    if (b.total === null) return -1;
    return a.total - b.total;
  }
  return a.name.localeCompare(b.name);
}
