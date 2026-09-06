import { nightsBetween } from "./payout";

/**
 * How a stay was priced, and what it comes to.
 *
 * There are two ways to say the same thing: a total for the whole booking, or a
 * rate per night that the nights multiply up. Both end as one number —
 * `sale_price`, the gross total — because that is what `payout.ts`, `owed.ts`,
 * Stats and the settlements engine all read, and none of them should have to
 * learn a second way to ask what a stay was worth.
 *
 * `nightly_price` is not a second price. It records *how the total was reached*,
 * which buys two things a bare total cannot: an edit reopens the way it was
 * entered, and a date change re-multiplies rather than leaving a total that no
 * longer matches the nights it is supposed to cover.
 *
 * **The multiplication happens here, on the server.** The form shows the same
 * arithmetic live, but what it posts is the rate — never the product. A total
 * the browser worked out is a total the browser can choose.
 */
export type BookingPrice = {
  /** Always the gross total. This is the only figure that gets stored as money. */
  salePrice: number;
  /** The rate, when that is how it was entered. Null means a total was typed. */
  nightlyPrice: number | null;
};

export type PriceMode = "total" | "nightly";

/** What the form posts to say which box the person actually filled in. */
export function readPriceMode(formData: FormData): PriceMode {
  return formData.get("price_mode") === "nightly" ? "nightly" : "total";
}

/**
 * Hours are not nights. A short stay is a flat rate for its window — it is
 * stored as a single night so every night-based query keeps working, and
 * multiplying by that 1 would dress a flat rate up as a per-night one. So the
 * per-night mode is refused for short stays rather than quietly mis-applied.
 */
/** Same shape as `payoutReader`, so both read the same way at a call site. */
export type PricedStay = { ok: true; price: BookingPrice } | { ok: false; error: string };

export function readBookingPrice(
  formData: FormData,
  args: { checkIn: string; checkOut: string; isShortStay: boolean }
): PricedStay {
  const mode = readPriceMode(formData);

  if (mode === "nightly") {
    if (args.isShortStay) {
      return {
        ok: false,
        error:
          "A short stay is charged as one flat rate for the window, not per night. Enter a total.",
      };
    }

    const rate = Number(formData.get("nightly_price"));
    if (!Number.isFinite(rate) || rate < 0) {
      return { ok: false, error: "Enter a per-night price." };
    }

    const nights = nightsBetween(args.checkIn, args.checkOut);
    if (nights < 1) {
      return { ok: false, error: "Check-out must be after check-in to price a stay per night." };
    }

    return { ok: true, price: { salePrice: rate * nights, nightlyPrice: rate } };
  }

  const total = Number(formData.get("sale_price"));
  if (!Number.isFinite(total) || total < 0) {
    return { ok: false, error: "Enter a sale price." };
  }

  return { ok: true, price: { salePrice: total, nightlyPrice: null } };
}

/** "PKR 5,000 × 3 nights" — the one place that sentence is worded. */
export function formatNightly(rate: number, nights: number, money: (n: number) => string): string {
  return `${money(rate)} × ${nights} ${nights === 1 ? "night" : "nights"}`;
}
