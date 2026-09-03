export type DealModel = "percent" | "fixed" | "ads" | "fixed_stack" | "fixed_percent";

export const DEAL_MODELS: { value: DealModel; label: string }[] = [
  { value: "percent", label: "Percentage per booking" },
  { value: "fixed", label: "Fixed monthly fee" },
  { value: "ads", label: "Stack rate (per-night floor)" },
  { value: "fixed_stack", label: "Fixed fee + stack rate" },
  { value: "fixed_percent", label: "Fixed fee + percentage" },
];

/**
 * Bookings that come in through an OTA settle on their own per-client terms,
 * not the base deal model: on some clients Hostello earns nothing on them at
 * all, on others a percentage or the stack-rate spread.
 */
export type OtaModel = "none" | "percent" | "stack";

export const OTA_MODELS: { value: OtaModel; label: string }[] = [
  { value: "percent", label: "Percentage of each booking" },
  { value: "stack", label: "Stack rate (per-night floor)" },
  { value: "none", label: "Nothing — the full net goes to the owner" },
];

const OTA_SOURCES = ["airbnb", "booking_com"];

export function isOtaSource(source: string): boolean {
  return OTA_SOURCES.includes(source);
}

/**
 * Sources Hostello earns nothing on, whatever the deal model says: the owner
 * sourced the guest themselves, a referral or a walk-in arrived at the door, or
 * nobody recorded where it came from. None of them are Hostello's sale, so the
 * whole net goes to the owner.
 */
export const PASS_THROUGH_SOURCES = ["client", "offline", "reference", "other"];

export function isPassThroughSource(source: string): boolean {
  return PASS_THROUGH_SOURCES.includes(source);
}

/**
 * Does this booking's share come out of the stack rate? The same branch
 * `calculatePayout` takes below, exported so a form can warn that the rate it
 * is about to divide by is zero rather than silently handing Hostello the lot.
 */
export function usesStackRate(input: {
  dealModel: DealModel;
  otaModel: OtaModel;
  source: string;
}): boolean {
  if (isPassThroughSource(input.source)) return false;
  if (isOtaSource(input.source)) return input.otaModel === "stack";
  return input.dealModel === "ads" || input.dealModel === "fixed_stack";
}

/**
 * Nights are always derived from dates, never typed in.
 * Check-out day does not count (5th to 8th is 3 nights).
 */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const inDate = new Date(checkIn + "T00:00:00");
  const outDate = new Date(checkOut + "T00:00:00");
  const ms = outDate.getTime() - inDate.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export type PayoutInput = {
  salePrice: number;
  checkIn: string;
  checkOut: string;
  dealModel: DealModel;
  sharePercent: number; // used by percent, fixed_percent
  deductPercent: number; // applied first, off gross
  stackRate: number; // per night, used by ads, fixed_stack and the 'stack' OTA model
  otaModel: OtaModel; // stands in for the deal model on airbnb / booking_com bookings
  otaSharePercent: number; // used when otaModel is 'percent'
  source: string; // self-sourced / walk-in / referral / other earn Hostello nothing
  status: "confirmed" | "tentative" | "cancelled";
};

export type PayoutResult = {
  nights: number;
  netSale: number;
  hostelloShare: number;
  clientPayout: number;
};

/**
 * The single source of truth for Hostello's revenue split.
 * Mirrors the rules in the Hostello context brief exactly:
 * deduction is applied first, off gross, before any share is calculated.
 */
export function calculatePayout(input: PayoutInput): PayoutResult {
  const nights = nightsBetween(input.checkIn, input.checkOut);
  const netSale =
    Math.round(input.salePrice * (1 - input.deductPercent / 100) * 100) / 100;

  const earnsNothing = isPassThroughSource(input.source) || input.status === "tentative";

  let hostelloShare = 0;

  if (!earnsNothing && isOtaSource(input.source)) {
    switch (input.otaModel) {
      case "percent":
        hostelloShare = (netSale * input.otaSharePercent) / 100;
        break;
      case "stack":
        hostelloShare = Math.max(0, netSale - input.stackRate * nights);
        break;
      case "none":
        hostelloShare = 0;
        break;
    }
  } else if (!earnsNothing) {
    switch (input.dealModel) {
      case "percent":
      case "fixed_percent":
        hostelloShare = (netSale * input.sharePercent) / 100;
        break;
      case "ads":
      case "fixed_stack":
        hostelloShare = Math.max(0, netSale - input.stackRate * nights);
        break;
      case "fixed":
        hostelloShare = 0;
        break;
    }
  }

  hostelloShare = Math.round(hostelloShare * 100) / 100;
  const clientPayout = Math.round((netSale - hostelloShare) * 100) / 100;

  return { nights, netSale, hostelloShare, clientPayout };
}

export function formatPKR(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `Rs ${n.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}
