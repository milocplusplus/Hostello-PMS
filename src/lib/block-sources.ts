export const BLOCK_TYPES = [
  { value: "blocked", label: "Blocked (unavailable)" },
  { value: "maintenance", label: "Maintenance (out of service)" },
  { value: "booked", label: "Booked (guest staying)" },
] as const;

/**
 * What a person picks when blocking dates. `booked` is left out on purpose: it
 * is what a channel sync writes for an imported reservation, not something
 * anyone chooses — a stay someone books here is a booking, not a block.
 */
export const MANUAL_BLOCK_TYPES = BLOCK_TYPES.filter((b) => b.value !== "booked");

export function isManualBlockType(value: unknown): boolean {
  return MANUAL_BLOCK_TYPES.some((b) => b.value === value);
}

/** The short word for a block on a bar, a day sheet row or a legend. */
export function blockTypeLabel(value: string | null | undefined): string {
  switch (value) {
    case "booked":
      return "Booked";
    case "maintenance":
      return "Maintenance";
    default:
      return "Blocked";
  }
}

/**
 * Blocks are coloured by what they mean, not by who wrote them. Maintenance
 * gets its own so a unit out of service does not read as an owner keeping it —
 * they are the same to availability and very different to whoever is planning
 * the week.
 */
export function blockTypeColor(value: string | null | undefined): string {
  switch (value) {
    case "booked":
      return "var(--color-status-booked)";
    case "maintenance":
      return "var(--color-status-maintenance)";
    default:
      return "var(--color-status-blocked)";
  }
}

export const BOOKING_SOURCES = [
  { value: "airbnb", label: "Airbnb" },
  { value: "booking_com", label: "Booking.com" },
  { value: "hostello", label: "Hostello Direct" },
  { value: "client", label: "Client (self-sourced)" },
  { value: "offline", label: "Offline / Walk-in" },
  { value: "reference", label: "Reference / Referral" },
  { value: "other", label: "Other" },
] as const;

export function sourceLabel(value: string | null | undefined) {
  return BOOKING_SOURCES.find((s) => s.value === value)?.label ?? null;
}

/** Channel dot colors — shared by the dashboard and (from Phase 3) the calendar. */
export function sourceColor(value: string | null | undefined): string {
  switch (value) {
    case "airbnb":
      return "var(--color-channel-airbnb)";
    case "booking_com":
      return "var(--color-channel-booking)";
    case "hostello":
      return "var(--color-channel-hostello)";
    case "client":
      return "var(--color-hostello-gold-muted)";
    case "offline":
      return "var(--color-status-pending)";
    case "reference":
      return "var(--color-channel-maintenance)";
    default:
      return "var(--color-ink-muted)";
  }
}

/** Single letter for the channel badge: A / B / H, else the first letter of the label. */
export function sourceInitial(value: string | null | undefined): string {
  return (sourceLabel(value) ?? "?").charAt(0).toUpperCase();
}
