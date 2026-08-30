/**
 * What an edit actually changed, in words an OS banner can carry.
 *
 * Both portals edit bookings, and the owner should read the same sentence
 * whichever side made the change — so the comparison and the wording live here
 * rather than in each `actions.ts`.
 */
export type BookingSnapshot = {
  checkIn: string;
  checkOut: string;
  salePrice: number;
  status: string;
  guestName: string | null;
  propertyIds: string[];
  /** Null when the booking is nights. Switching either way is a change. */
  shortStay: ShortStay | null;
};

import { hhmm, type ShortStay } from "./short-stay";

function window(stay: ShortStay | null) {
  return stay ? `${hhmm(stay.start)}-${hhmm(stay.end)}` : "";
}

function sameUnits(a: string[], b: string[]) {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

/** "Dates and price" — or null when the save changed nothing worth announcing. */
export function describeBookingChanges(
  before: BookingSnapshot,
  after: BookingSnapshot
): string | null {
  const changed: string[] = [];

  if (before.checkIn !== after.checkIn || before.checkOut !== after.checkOut) changed.push("dates");
  if (window(before.shortStay) !== window(after.shortStay)) changed.push("hours");
  if (!sameUnits(before.propertyIds, after.propertyIds)) changed.push("units");
  if (Number(before.salePrice) !== Number(after.salePrice)) changed.push("price");
  if (before.status !== after.status) changed.push("status");
  if ((before.guestName ?? "") !== (after.guestName ?? "")) changed.push("guest");

  if (changed.length === 0) return null;
  if (changed.length === 1) return capitalise(changed[0]);

  const last = changed[changed.length - 1];
  return capitalise(`${changed.slice(0, -1).join(", ")} and ${last}`);
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
