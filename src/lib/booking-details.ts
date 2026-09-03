/**
 * The operational facts about a stay, as opposed to its money: how many people
 * are coming and when they say they will turn up.
 *
 * Read through here by all four write paths — both portals' create and update —
 * so an empty field means the same thing everywhere: null, "they have not told
 * us", never a guessed default. A time input posts "" when untouched, and ""
 * is not a valid `time` to Postgres, so the coercion has to happen once rather
 * than at four call sites.
 *
 * A short stay states its own hours in `short_stay_start`/`end`; these two are
 * for a stay measured in nights, whose date says nothing about the hour.
 */
export type BookingDetails = {
  guestsCount: number | null;
  expectedArrival: string | null;
  expectedDeparture: string | null;
};

function readTime(form: FormData, field: string): string | null {
  const value = ((form.get(field) as string) ?? "").trim();
  return value === "" ? null : value;
}

export function readBookingDetails(form: FormData): BookingDetails {
  const guests = Number(form.get("guests_count"));

  return {
    // 0 or a blank box is "not recorded", not a booking for nobody.
    guestsCount: Number.isFinite(guests) && guests > 0 ? Math.floor(guests) : null,
    expectedArrival: readTime(form, "expected_arrival"),
    expectedDeparture: readTime(form, "expected_departure"),
  };
}
