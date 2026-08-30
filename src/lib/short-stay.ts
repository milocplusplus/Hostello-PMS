import { addDaysISO } from "./calendar";

/**
 * Short stays — a few hours on one date, priced off their own stack rate.
 *
 * **A short stay is stored as a one-night booking**: `check_out = check_in + 1`,
 * with `is_short_stay` and the two times saying it is really hours. That keeps
 * every night-based query in the app — availability, the calendar, occupancy,
 * `calculatePayout` — working untouched, and makes the stack deduction land as
 * `short_stay_stack_rate × 1 night`, i.e. flat per stay. The property's
 * `short_stay_stack_rate` is what gets snapshotted onto the booking instead of
 * its nightly `stack_rate`.
 *
 * The one place `check_out` must not be believed is the departure day: a short
 * stay leaves on the date it arrived, so read it through `departureDate()`.
 * And once it is ticked off (`checked_out_at`), the date is free to sell again
 * — see `findStayClash` / `listUnavailable` in `availability.ts`.
 */
export type ShortStay = { start: string; end: string };

/** What the form opens with — an afternoon slot, the common case. */
export const DEFAULT_SHORT_STAY: ShortStay = { start: "12:00", end: "18:00" };

/** The `check_out` a short stay on `date` is written with. */
export function shortStayCheckOut(date: string): string {
  return addDaysISO(date, 1);
}

/** The day the guest actually leaves — the arrival date itself for a short stay. */
export function departureDate(checkIn: string, checkOut: string, isShortStay: boolean): string {
  return isShortStay ? checkIn : checkOut;
}

/**
 * What the booking form said about hours, checked before anything is written.
 * Both portals' `actions.ts` read it through here so the rule is stated once.
 */
export function readShortStay(form: FormData): { shortStay: ShortStay | null; error: string | null } {
  if (!form.get("is_short_stay")) return { shortStay: null, error: null };

  const start = ((form.get("short_stay_start") as string) ?? "").trim();
  const end = ((form.get("short_stay_end") as string) ?? "").trim();

  if (!start || !end) {
    return { shortStay: null, error: "A short stay needs a start and an end time." };
  }
  if (end <= start) {
    return { shortStay: null, error: "The short stay has to end after it starts." };
  }
  return { shortStay: { start, end }, error: null };
}

/** Postgres returns "14:00:00"; a time input and every comparison want "14:00". */
export function hhmm(value: string): string {
  return value.slice(0, 5);
}

/** The short stay a booking row is carrying, if it is one. */
export function rowShortStay(row: {
  is_short_stay?: boolean | null;
  short_stay_start?: string | null;
  short_stay_end?: string | null;
}): ShortStay | null {
  if (!row.is_short_stay || !row.short_stay_start || !row.short_stay_end) return null;
  return { start: hhmm(row.short_stay_start), end: hhmm(row.short_stay_end) };
}

/** "14:00:00" → "2:00 PM". Times are wall-clock, so no Date and no timezone. */
export function formatTime(value: string): string {
  const [h, m] = value.split(":");
  const hour = Number(h);
  const suffix = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${m} ${suffix}`;
}

/** "2:00 PM – 8:00 PM" */
export function formatShortStayWindow(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** Hours between the two times, one decimal at most. */
export function shortStayHours(start: string, end: string): number {
  const minutes = toMinutes(end) - toMinutes(start);
  return Math.round((minutes / 60) * 10) / 10;
}

function toMinutes(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m);
}
