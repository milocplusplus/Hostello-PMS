import { todayISO } from "@/lib/calendar";

/**
 * Turning a channel's foreign-currency figure into rupees.
 *
 * `payout.ts` is PKR throughout and stays that way: this only produces the PKR
 * sale price a booking is saved with, and remembers what it was converted from
 * so it can be converted again at the check-in day's rate (the owner's choice).
 * Airbnb pays out in PKR at its own rate, so the market rate here is an
 * estimate of what lands in the bank, not the figure itself.
 *
 * The rate is the free daily mid-market one from open.er-api.com — no key, one
 * update a day. It is fetched on the server and cached for an hour, and a
 * failure returns null: the reviewer then types the rupee figure, which is
 * exactly what they did before any of this existed.
 */

export type FxRate = {
  currency: string;
  /** Rupees for one unit of `currency`. */
  pkrPerUnit: number;
  /** The day the rate was published, `yyyy-mm-dd`. */
  asOf: string;
};

export async function pkrRate(currency: string | null | undefined): Promise<FxRate | null> {
  const code = (currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || code === "PKR") return null;

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${code}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      result?: string;
      time_last_update_unix?: number;
      rates?: Record<string, number>;
    };
    const rate = body.rates?.PKR;
    if (body.result !== "success" || typeof rate !== "number" || !(rate > 0)) return null;
    const asOf = body.time_last_update_unix
      ? new Date(body.time_last_update_unix * 1000).toISOString().slice(0, 10)
      : todayISO();
    return { currency: code, pkrPerUnit: rate, asOf };
  } catch {
    return null;
  }
}

/** Whole rupees, like every other price in the app. */
export function toPkr(amount: number, rate: FxRate): number {
  return Math.round(amount * rate.pkrPerUnit);
}

/**
 * The provenance columns for a converted price, from the hidden fields the
 * inbox puts on its forms (`original_currency`, `original_amount`,
 * `fx_rate_on`). Null when the form carried none — an ordinary booking.
 *
 * The rate is stored as *applied* — sale price ÷ original — so a reviewer who
 * rounded or corrected the rupee figure is recorded as having done so, and the
 * check-in re-conversion starts from the original amount either way. A stay
 * already at or past check-in is at its check-in rate, so not provisional.
 */
export function readFx(
  formData: FormData,
  salePrice: number,
  checkIn: string
): {
  original_currency: string;
  original_amount: number;
  fx_rate: number;
  fx_rate_on: string;
  fx_provisional: boolean;
} | null {
  const currency = ((formData.get("original_currency") as string) ?? "").trim().toUpperCase();
  const amount = Number(formData.get("original_amount"));
  const on = ((formData.get("fx_rate_on") as string) ?? "").trim();

  if (!/^[A-Z]{3}$/.test(currency) || currency === "PKR" || !(amount > 0) || !salePrice) return null;

  return {
    original_currency: currency,
    original_amount: amount,
    fx_rate: Math.round((salePrice / amount) * 10000) / 10000,
    fx_rate_on: /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : todayISO(),
    fx_provisional: checkIn > todayISO(),
  };
}
