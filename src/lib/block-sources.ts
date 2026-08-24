export const BLOCK_TYPES = [
  { value: "blocked", label: "Blocked (unavailable)" },
  { value: "booked", label: "Booked (guest staying)" },
] as const;

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
