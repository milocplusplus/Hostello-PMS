import { BOOKING_SOURCES, sourceLabel } from "./block-sources";
import { nightsBetween } from "./payout";

/**
 * The channels the business thinks in. They are always listed, even at zero, so
 * "no Airbnb revenue this month" reads as a fact rather than a missing row.
 * Any other source (offline / reference / other) only appears once it has one.
 */
const HEADLINE_SOURCES = ["hostello", "airbnb", "booking_com", "client"];

/** Only the columns the breakdown sums — no revenue is recomputed here. */
export type StatsBooking = {
  check_in: string;
  check_out: string;
  source: string;
  sale_price: number | null;
  hostello_share: number | null;
  client_payout: number | null;
};

export type SourceStats = {
  source: string;
  label: string;
  bookings: number;
  nights: number;
  gross: number;
  hostelloShare: number;
  clientPayout: number;
  /** Percent of the window's gross revenue. */
  share: number;
};

function empty(source: string): SourceStats {
  return {
    source,
    label: sourceLabel(source) ?? source,
    bookings: 0,
    nights: 0,
    gross: 0,
    hostelloShare: 0,
    clientPayout: 0,
    share: 0,
  };
}

const ORDER = BOOKING_SOURCES.map((s) => s.value as string);

/**
 * Splits a window's bookings by channel. Totals come straight off the stored
 * columns `payout.ts` wrote at booking time — this never recalculates a split.
 */
export function statsBySource(rows: StatsBooking[]): {
  total: SourceStats;
  sources: SourceStats[];
} {
  const total = empty("all");
  total.label = "All sources";

  const bySource = new Map<string, SourceStats>(
    HEADLINE_SOURCES.map((s) => [s, empty(s)])
  );

  for (const b of rows) {
    const entry = bySource.get(b.source) ?? empty(b.source);
    bySource.set(b.source, entry);

    const gross = Number(b.sale_price ?? 0);
    const nights = nightsBetween(b.check_in, b.check_out);
    for (const t of [entry, total]) {
      t.bookings += 1;
      t.nights += nights;
      t.gross += gross;
      t.hostelloShare += Number(b.hostello_share ?? 0);
      t.clientPayout += Number(b.client_payout ?? 0);
    }
  }

  const sources = [...bySource.values()].sort(
    (a, b) => b.gross - a.gross || ORDER.indexOf(a.source) - ORDER.indexOf(b.source)
  );
  for (const s of sources) {
    s.share = total.gross > 0 ? Math.round((s.gross / total.gross) * 1000) / 10 : 0;
  }
  total.share = total.gross > 0 ? 100 : 0;

  return { total, sources };
}
