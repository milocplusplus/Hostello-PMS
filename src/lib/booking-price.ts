import { defaultCollector, isCollector, nightsBetween, type Collector } from "./payout";

/**
 * Who received the advance and who receives the balance. A form that does not
 * say (a caller that never showed the choice) keeps what the booking had, or
 * for a new one starts on its channel's default.
 */
export function readCollectors(
  formData: FormData,
  source: string,
  existing?: { advance_received_by: string | null; balance_received_by: string | null } | null
): { advanceReceivedBy: Collector; balanceReceivedBy: Collector } {
  const pick = (field: "advance_received_by" | "balance_received_by"): Collector => {
    const posted = formData.get(field);
    if (isCollector(posted)) return posted;
    const kept = existing?.[field];
    return isCollector(kept) ? kept : defaultCollector(source);
  };
  return {
    advanceReceivedBy: pick("advance_received_by"),
    balanceReceivedBy: pick("balance_received_by"),
  };
}

/**
 * What Hostello earns, when the admin typed it instead of taking the deal's
 * figure. The typed amount belongs to the price and dates it was typed
 * against: an edit that changes either goes back to the deal unless it brings
 * a new amount with it.
 *
 * The admin's form always posts `hostello_share_typed` — empty meaning "use
 * the deal". A form without the field (the owner's, a quick tool, an ops
 * session) types nothing and only inherits.
 */
export function readShareOverride(
  formData: FormData,
  args: {
    mayType: boolean;
    salePrice: number;
    checkIn: string;
    checkOut: string;
    existing?: {
      hostello_share_override: number | string | null;
      sale_price: number | string | null;
      check_in: string;
      check_out: string;
    } | null;
  }
): { ok: true; override: number | null } | { ok: false; error: string } {
  const posted = args.mayType ? formData.get("hostello_share_typed") : null;

  if (typeof posted === "string") {
    if (posted.trim() === "") return { ok: true, override: null };
    const amount = Number(posted);
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: "Enter what Hostello earns as an amount in rupees." };
    }
    if (amount > args.salePrice) {
      return { ok: false, error: "Hostello cannot earn more than the booking's price." };
    }
    return { ok: true, override: amount };
  }

  const kept = args.existing?.hostello_share_override;
  const unchanged =
    args.existing != null &&
    Number(args.existing.sale_price ?? 0) === args.salePrice &&
    args.existing.check_in === args.checkIn &&
    args.existing.check_out === args.checkOut;
  return { ok: true, override: kept != null && unchanged ? Number(kept) : null };
}

/**
 * A stay a confirmed payment has already closed keeps who received its money:
 * changing it would flip a settled balance to the other side.
 */
export function collectorsLocked(
  existing: {
    advance_received_by: string | null;
    balance_received_by: string | null;
    settled: boolean | null;
    share_received: boolean | null;
  },
  next: { advanceReceivedBy: Collector; balanceReceivedBy: Collector }
): string | null {
  const changed =
    existing.advance_received_by !== next.advanceReceivedBy ||
    existing.balance_received_by !== next.balanceReceivedBy;
  return changed && (existing.settled || existing.share_received)
    ? "This stay's money is already settled. Undo the payment on the Money page before changing who received it."
    : null;
}

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
