import { formatPKR } from "./payout";

/**
 * What an owner may ask to have changed about their own unit, and how that ask
 * is worded.
 *
 * `properties` is SELECT-only for a client, deliberately: the asking price is
 * what a guest is quoted and what the availability finder offers. So an owner
 * proposes and an admin applies. Only these two fields are ever proposable —
 * `stack_rate` is a negotiated deal term and is not on a form anyone fills in
 * alone.
 *
 * Everything here is display: the request rows carry the numbers, the admin's
 * apply writes them. Nothing in this file reads or writes the database.
 */

export type RequestStatus = "pending" | "applied" | "declined";

export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: string }> = {
  pending: { label: "Waiting on Hostello", tone: "text-status-pending" },
  applied: { label: "Applied", tone: "text-financial" },
  declined: { label: "Not applied", tone: "text-status-booked" },
};

export function isRequestStatus(value: unknown): value is RequestStatus {
  return value === "pending" || value === "applied" || value === "declined";
}

/** What a request asks for. Null on either field means "leave it as it is". */
export type RequestedChange = {
  maxGuests: number | null;
  nightlyRate: number | null;
};

/** What the unit holds today, so a line can read as a change and not a number. */
export type CurrentValues = {
  maxGuests: number | null;
  nightlyRate: number | null;
};

/**
 * One line per field the request actually asks about — "Sleeps 4 → 6". A field
 * left null is not mentioned at all, which is what keeps an ask for a rate from
 * implying anything about the capacity.
 */
export function describeChange(asked: RequestedChange, current: CurrentValues): string[] {
  const lines: string[] = [];

  if (asked.maxGuests != null) {
    const from = current.maxGuests == null ? "not set" : String(current.maxGuests);
    lines.push(`Sleeps ${from} → ${asked.maxGuests}`);
  }

  if (asked.nightlyRate != null) {
    const from = current.nightlyRate == null ? "not set" : formatPKR(current.nightlyRate);
    lines.push(`Nightly rate ${from} → ${formatPKR(asked.nightlyRate)}`);
  }

  return lines;
}

/** The same thing on one line, for a notification body and a list subtitle. */
export function summariseChange(asked: RequestedChange, current: CurrentValues): string {
  return describeChange(asked, current).join(" · ") || "No change requested";
}

/**
 * Reads the two fields off a submitted form. An empty box means "leave it
 * alone", which is why a blank is null and not zero — `Number("")` is 0, and a
 * rate of zero is a real value someone could mean.
 */
export function readRequestedChange(formData: FormData):
  | { ok: true; change: RequestedChange }
  | { ok: false; error: string } {
  const rawGuests = (formData.get("max_guests") as string | null)?.trim() ?? "";
  const rawRate = (formData.get("nightly_rate") as string | null)?.trim() ?? "";

  const maxGuests = rawGuests === "" ? null : Number(rawGuests);
  const nightlyRate = rawRate === "" ? null : Number(rawRate);

  if (maxGuests !== null && (!Number.isInteger(maxGuests) || maxGuests < 1)) {
    return { ok: false, error: "Sleeps has to be a whole number of guests, 1 or more." };
  }
  if (nightlyRate !== null && (!Number.isFinite(nightlyRate) || nightlyRate < 0)) {
    return { ok: false, error: "A nightly rate can't be negative." };
  }
  if (maxGuests === null && nightlyRate === null) {
    return { ok: false, error: "Fill in a new capacity or a new nightly rate — or both." };
  }

  return { ok: true, change: { maxGuests, nightlyRate } };
}
