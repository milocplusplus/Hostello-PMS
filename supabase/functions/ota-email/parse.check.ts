/**
 * Real channel mails, and what each must parse to.
 *
 *   node supabase/functions/ota-email/parse.check.ts
 *
 * The fixtures are genuine Airbnb and Booking.com mails from September 2026
 * with the guests' names, reservation codes, tracking links and the guest's
 * own message text swapped out. When a channel restyles its mail: save the new
 * one here the same way, add what it should read as, and fix `parse.ts` until
 * this passes again.
 *
 * Each mail is run three ways, because each is a way it can reach us: as sent
 * (headers and HTML intact), forwarded by hand (Airbnb's `X-Template` header
 * lost, so the kind must come from the wording), and as plain text alone.
 * Plain text upper-cases Airbnb's headings, so names and titles are compared
 * without regard to case there.
 */

import { readFileSync } from "node:fs";
import { parseOtaEmail, type OtaKind, type ParsedReservation } from "./parse.ts";

type Fixture = {
  subject: string;
  from: string;
  template: string;
  date: string;
  text: string;
  html: string;
};

type Expected = {
  kind: OtaKind;
  source: "airbnb" | "booking_com";
  skip?: boolean;
  parsed?: Partial<ParsedReservation>;
};

const CASES: Record<string, Expected> = {
  "airbnb-new-booking": {
    source: "airbnb",
    kind: "new_booking",
    parsed: {
      listing: "Murree Escape Studio | Clean, Comfortable & Serene",
      listing_id: "1681716447006369455",
      guest_name: "Sana Malik",
      guest_phone: null,
      check_in: "2026-09-28",
      check_out: "2026-09-29",
      guests: 1,
      currency: "USD",
      gross: 39,
      channel_fee: 6.05,
      host_payout: 32.95,
      reservation_code: "HMTESTCNF1",
    },
  },
  "airbnb-cancellation": {
    source: "airbnb",
    kind: "cancellation",
    parsed: {
      listing: "Nature-Facing Studio | Calm, Clean & Comfortable",
      listing_id: "1650142990093435780",
      guest_name: "Hina",
      check_in: "2026-10-08",
      check_out: "2026-10-11",
      guests: 2,
      reservation_code: "HMTESTCXL2",
    },
  },
  "airbnb-alteration": {
    source: "airbnb",
    kind: "alteration",
    // All this mail says. The new dates are not in it.
    parsed: {
      guest_name: "Hina",
      check_in: null,
      check_out: null,
      gross: null,
      reservation_code: "HMTESTCXL2",
    },
  },
  "airbnb-guest-message": { source: "airbnb", kind: "unknown", skip: true },
  "booking-com-new-booking": {
    source: "booking_com",
    kind: "new_booking",
    parsed: {
      listing: "The Point Apartment Hotel",
      listing_id: "17239542",
      guest_name: null,
      check_in: "2026-09-27",
      check_out: null,
      gross: null,
      reservation_code: "5200000001",
    },
  },
  "booking-com-cancellation": {
    source: "booking_com",
    kind: "cancellation",
    parsed: {
      listing: "The Point Apartment Hotel",
      listing_id: "17239542",
      check_in: null,
      reservation_code: "5200000001",
    },
  },
};

const WAYS = {
  "as sent": (f: Fixture) => f,
  "forwarded by hand": (f: Fixture) => ({ ...f, template: "" }),
  "plain text only": (f: Fixture) => ({ ...f, html: "" }),
} satisfies Record<string, (f: Fixture) => Fixture>;

const CASE_BLIND = new Set(["listing", "guest_name"]);

let failures = 0;
let checks = 0;

function fail(label: string, message: string) {
  failures++;
  console.log(`  ✗ ${label}: ${message}`);
}

for (const [name, expected] of Object.entries(CASES)) {
  const fixture = JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")
  ) as Fixture;

  for (const [way, variant] of Object.entries(WAYS)) {
    const mail = variant(fixture);
    const label = `${name} (${way})`;
    const out = parseOtaEmail({
      subject: mail.subject,
      from: mail.from,
      template: mail.template,
      textBody: mail.text,
      htmlBody: mail.html,
      receivedAt: new Date(mail.date),
    });

    checks++;
    if (out.source !== expected.source) fail(label, `source ${out.source}, expected ${expected.source}`);
    if (out.kind !== expected.kind) fail(label, `kind ${out.kind}, expected ${expected.kind}`);
    if (Boolean(out.skip) !== Boolean(expected.skip)) fail(label, `skip ${out.skip}`);
    if (!expected.skip && out.error) fail(label, `error "${out.error}"`);

    for (const [field, want] of Object.entries(expected.parsed ?? {})) {
      const got = out.parsed[field as keyof ParsedReservation];
      const same =
        way === "plain text only" && CASE_BLIND.has(field) && typeof got === "string" && typeof want === "string"
          ? got.toLowerCase() === want.toLowerCase()
          : got === want;
      if (!same) fail(label, `${field} ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
    }
  }
}

console.log(
  failures === 0
    ? `All ${checks} parses match (${Object.keys(CASES).length} mails × ${Object.keys(WAYS).length} ways).`
    : `${failures} mismatch${failures === 1 ? "" : "es"}.`
);

if (failures > 0) throw new Error("parse.check failed");
