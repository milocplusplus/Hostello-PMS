/**
 * The one rule for a bulk rate change, shared by the live preview on
 * /admin/rates and /admin/clients/[id]/rates and the Server Action that saves
 * it — so what the preview shows is what gets written.
 *
 * `asking` marks what a guest is quoted. Those may be changed across every
 * client at once; the rest are one client's deal terms and stay on their page.
 */

export const RATE_FIELDS = [
  { key: "stack_rate", label: "Nightly stack rate", money: true, asking: false },
  { key: "short_stay_stack_rate", label: "Short-stay stack rate", money: true, asking: false },
  { key: "max_guests", label: "Max guests", money: false, asking: false },
  { key: "nightly_rate", label: "Nightly price", money: true, asking: true },
  { key: "short_stay_rate", label: "Short-stay price", money: true, asking: true },
] as const;

export type RateField = (typeof RATE_FIELDS)[number]["key"];

export const ASKING_FIELDS: readonly RateField[] = RATE_FIELDS.filter((f) => f.asking).map(
  (f) => f.key
);

export const ADJUST_MODES = [
  { key: "set", label: "Set to" },
  { key: "add", label: "Increase by" },
  { key: "sub", label: "Decrease by" },
  { key: "pct_up", label: "Increase by %" },
  { key: "pct_down", label: "Decrease by %" },
] as const;

export type AdjustMode = (typeof ADJUST_MODES)[number]["key"];

export function isRateField(v: unknown): v is RateField {
  return RATE_FIELDS.some((f) => f.key === v);
}

export function isAdjustMode(v: unknown): v is AdjustMode {
  return ADJUST_MODES.some((m) => m.key === v);
}

/**
 * The new value, or null when it would make no sense (below zero, or a
 * percentage of a rate that was never set). Money changed by a percentage is
 * rounded to the nearest 100; guests are whole people.
 */
export function adjusted(
  field: RateField,
  current: number | null,
  mode: AdjustMode,
  value: number
): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const money = field !== "max_guests";
  const base = current ?? 0;

  let next: number;
  switch (mode) {
    case "set":
      next = value;
      break;
    case "add":
      next = base + value;
      break;
    case "sub":
      next = base - value;
      break;
    case "pct_up":
    case "pct_down": {
      if (current === null) return null;
      const factor = mode === "pct_up" ? 1 + value / 100 : 1 - value / 100;
      next = money ? Math.round((base * factor) / 100) * 100 : base * factor;
      break;
    }
  }

  next = Math.round(next);
  if (next < 0 || (field === "max_guests" && next < 1)) return null;
  return next;
}
