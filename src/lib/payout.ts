export type DealModel = "percent" | "fixed" | "ads" | "fixed_stack" | "fixed_percent";

export const DEAL_MODELS: { value: DealModel; label: string }[] = [
  { value: "percent", label: "Percentage per booking" },
  { value: "fixed", label: "Fixed monthly fee" },
  { value: "ads", label: "Stack rate (per-night floor)" },
  { value: "fixed_stack", label: "Fixed fee + stack rate" },
  { value: "fixed_percent", label: "Fixed fee + percentage" },
];

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
  stackRate: number; // per night, used by ads, fixed_stack
  source: string; // 'client' means self-sourced by the owner — Hostello earns nothing on it
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

  const selfSourcedOrTentative = input.source === "client" || input.status === "tentative";

  let hostelloShare = 0;

  if (!selfSourcedOrTentative) {
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
