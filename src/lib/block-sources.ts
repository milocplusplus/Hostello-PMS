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
