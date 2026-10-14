import { formatPKR } from "@/lib/payout";

/**
 * The Listing Coach's shared vocabulary. The reports themselves are written by
 * `coach_save_report()` in SQL, from what a scheduled Claude task read on
 * Airbnb; nothing in the app fetches Airbnb.
 */

/**
 * A pasted address or number as the listing link the task opens, or null.
 * Rebuilt on www.airbnb.com from the part that identifies the listing, so
 * whatever host the text named is never the one that gets opened.
 */
export function airbnbListingUrl(raw: string): string | null {
  const value = raw.trim();
  if (/^\d{4,25}$/.test(value)) return `https://www.airbnb.com/rooms/${value}`;
  const m = value.match(/airbnb\.[a-z.]+\/(?:rooms\/(\d{4,25})|h\/([a-z0-9-]{2,60}))/i);
  if (!m) return null;
  return m[1] ? `https://www.airbnb.com/rooms/${m[1]}` : `https://www.airbnb.com/h/${m[2].toLowerCase()}`;
}

/** A competitor is always a /rooms/<number> link: the table's check says so. */
export function airbnbRoomUrl(raw: string): string | null {
  const url = airbnbListingUrl(raw);
  return url?.includes("/rooms/") ? url : null;
}

export const FIX_AREAS: Record<string, string> = {
  title: "Title",
  description: "Description",
  photos: "Photos",
  amenities: "Amenities",
  rules: "Rules",
  price: "Price",
  reviews: "Reviews",
};

/**
 * Airbnb's description boxes, in its editor's order: the audit writes one text
 * for each. 500 is Airbnb's own limit on the first; Airbnb publishes none for
 * the others, so those are ours, to keep them short. `coach_save_report()`
 * holds the same numbers and keeps no box that is over; change both together.
 */
export const WORDING_BOXES = [
  { key: "suggested_description", label: "Listing description", max: 500, airbnb: true },
  { key: "suggested_space", label: "The space", max: 1000, airbnb: false },
  { key: "suggested_access", label: "Guest access", max: 500, airbnb: false },
  { key: "suggested_notes", label: "Other details to note", max: 500, airbnb: false },
] as const;

/** "412 / 500" where Airbnb sets the limit, a plain count where it does not. */
export function boxCount(text: string, box: (typeof WORDING_BOXES)[number]): string {
  return box.airbnb ? `${text.length} / ${box.max}` : `${text.length} characters`;
}

export type CoachCompetitor = {
  url: string;
  title: string | null;
  rating: number | null;
  reviews: number | null;
  weekend_usd: number | null;
  weekday_usd: number | null;
};

/** Airbnb's dollar figure, led by rupees when the run recorded that day's rate. */
export function coachMoney(usd: number | null, rate: number | null): string {
  if (usd == null) return "—";
  const dollars = `$${Math.round(usd)}`;
  return rate ? `${formatPKR(Math.round(usd * rate))} (${dollars})` : dollars;
}

/** Where the listing stood in its standard search, in words. */
export function positionLabel(position: number | null, pages: number): string {
  if (pages === 0) return "Not checked";
  return position == null ? `Not in the first ${pages} pages` : `Number ${position}`;
}

/**
 * A quarter above the competitors' middle price. `coach_save_report()` holds
 * the same line for `price_flag` and its alert; change both together.
 */
export function pricedHigh(usd: number | null, middle: number | null): boolean {
  return usd != null && middle != null && usd > middle * 1.25;
}

/** How far the listing's price sits from the competitors' middle price. */
export function againstMiddle(usd: number | null, middle: number | null): string | null {
  if (usd == null || !middle) return null;
  const pct = Math.round(((usd - middle) / middle) * 100);
  if (pct === 0) return "at the middle price";
  return `${Math.abs(pct)}% ${pct > 0 ? "above" : "below"} the middle price`;
}
