/**
 * Reading a channel's confirmation email.
 *
 * This is the only part of the OTA pipeline that is *guesswork*, and it is
 * written to be corrected rather than to be clever. Airbnb and Booking.com owe
 * us no stable format and restyle these mails without warning, so:
 *
 *  - every rule is a label in a table below, not a regex buried in a branch;
 *  - a field that cannot be read comes back `null` rather than wrong — the
 *    review screen shows a blank for an admin to fill, which is recoverable,
 *    where a confidently-wrong payout is not;
 *  - the raw mail is stored by the caller before this ever runs, so a fixed
 *    parser can be run again over everything it previously got wrong.
 *
 * Nothing here computes a payout. It reports what the channel *said*; what
 * Hostello earns is decided by `src/lib/payout.ts` when an admin approves.
 */

export type OtaSource = "airbnb" | "booking_com";

export type OtaKind = "new_booking" | "cancellation" | "alteration" | "payout" | "unknown";

export type ParsedReservation = {
  listing: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  /** ISO `yyyy-mm-dd`. */
  check_in: string | null;
  /**
   * ISO `yyyy-mm-dd`, **exclusive** — the departure date.
   *
   * This lines up with `bookings.check_out` with no conversion, because a
   * channel's "checkout" is the morning the guest leaves, which is exactly what
   * an exclusive check-out means. It is *not* the inclusive last night that
   * `calendar_blocks.end_date` holds. Do not convert it here.
   */
  check_out: string | null;
  guests: number | null;
  /** ISO 4217 where the mail said so. `null` means it never named one. */
  currency: string | null;
  /** What the guest paid the channel. */
  gross: number | null;
  /** What the channel says it will send the host. Reference only. */
  host_payout: number | null;
  reservation_code: string | null;
};

export type ParseOutcome = {
  source: OtaSource | null;
  kind: OtaKind;
  parsed: ParsedReservation;
  error: string | null;
};

// ── Text ────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&mdash;": "—",
  "&ndash;": "–",
  "&rsquo;": "’",
};

/** HTML mail flattened to lines, because every rule below is line-oriented. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // A table cell break is a field boundary, not a word boundary.
    .replace(/<\/(td|th)>/gi, "\n")
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

function lines(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

/**
 * The value for a label, whether the mail puts it after a colon on the same
 * line or on the line below (which is what the stacked "CHECK-IN / Fri, Jul 3"
 * blocks in Airbnb's HTML flatten to).
 */
function labelled(text: string, labels: string[]): string | null {
  return labelledAt(lines(text), labels)?.value ?? null;
}

/**
 * Where a label matched and what followed it.
 *
 * Longest label first, so "Guest name" is tried before "Guest". And the
 * character after the label has to be a separator, not a letter — without that
 * check "Guest" matches the line "Guests" and returns the leftover "s" as the
 * guest's name, which is exactly what it did the first time this ran.
 */
function labelledAt(
  rows: string[],
  labels: string[]
): { value: string | null; index: number; rest: string } | null {
  for (const label of [...labels].sort((a, b) => b.length - a.length)) {
    const needle = label.toLowerCase();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.toLowerCase().startsWith(needle)) continue;

      const after = row.charAt(label.length);
      if (after && !/[\s:•\-–—(,]/.test(after)) continue;

      const rest = row.slice(label.length).replace(/^[\s:•\-–—]+/, "").trim();
      if (rest) return { value: rest, index: i, rest };

      // Label alone on its line — the value is the next line, unless that is
      // itself another label.
      const next = rows[i + 1];
      return { value: next && !next.endsWith(":") ? next : null, index: i, rest: "" };
    }
  }

  return null;
}

/**
 * Money for a label, looking at the label's own line *and* the one below it.
 *
 * Channels split these constantly — "Total (PKR)" on one line and the figure on
 * the next — and the remainder "(PKR)" is non-empty, so a plain label lookup
 * stops there and reports nothing.
 */
function labelledMoney(
  text: string,
  labels: string[]
): { amount: number | null; currency: string | null } {
  const rows = lines(text);
  const hit = labelledAt(rows, labels);
  if (!hit) return { amount: null, currency: null };

  for (const candidate of [hit.rest, rows[hit.index + 1] ?? ""]) {
    const money = parseMoney(candidate);
    if (money.amount !== null) return money;
  }

  return { amount: null, currency: null };
}

function firstMatch(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m;
  }
  return null;
}

// ── Dates ───────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Rejects 31 February rather than letting it roll into March.
  if (dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * A date as a channel writes it. Handles `2026-07-03`, `Jul 3, 2026`,
 * `3 July 2026`, `Friday, 3 July` and the rest.
 *
 * A year-less date is the trap: Airbnb happily writes "Fri, Jul 3" for a stay
 * next January. `reference` is the date the mail arrived, and the year chosen
 * is the one that puts the date in the near future — a stay is almost never in
 * the past when its confirmation lands, but it can easily be in the next year.
 */
export function parseDate(raw: string | null, reference: Date): string | null {
  if (!raw) return null;

  const s = raw.replace(/(\d+)(st|nd|rd|th)\b/gi, "$1").trim();

  const isoMatch = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return iso(+isoMatch[1], +isoMatch[2], +isoMatch[3]);

  // "Jul 3 2026" / "July 3, 2026"
  const mdy = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\b(?:[,\s]+(\d{4}))?/);
  // "3 Jul 2026"
  const dmy = s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\b(?:[,\s]+(\d{4}))?/);

  let month: number | undefined;
  let day: number | undefined;
  let year: number | undefined;

  if (dmy && MONTHS[dmy[2].slice(0, 3).toLowerCase()]) {
    day = +dmy[1];
    month = MONTHS[dmy[2].slice(0, 3).toLowerCase()];
    year = dmy[3] ? +dmy[3] : undefined;
  } else if (mdy && MONTHS[mdy[1].slice(0, 3).toLowerCase()]) {
    month = MONTHS[mdy[1].slice(0, 3).toLowerCase()];
    day = +mdy[2];
    year = mdy[3] ? +mdy[3] : undefined;
  }

  if (month === undefined || day === undefined) return null;

  if (year === undefined) {
    const refYear = reference.getUTCFullYear();
    const candidate = Date.UTC(refYear, month - 1, day);
    // More than a month behind the mail means it meant next year.
    year = candidate < reference.getTime() - 31 * 86_400_000 ? refYear + 1 : refYear;
  }

  return iso(year, month, day);
}

// ── Money ───────────────────────────────────────────────────────────────────

const CURRENCY_WORDS: Record<string, string> = {
  pkr: "PKR", rs: "PKR", "₨": "PKR", "rs.": "PKR",
  usd: "USD", $: "USD",
  eur: "EUR", "€": "EUR",
  gbp: "GBP", "£": "GBP",
  aed: "AED", sar: "SAR",
};

export function parseMoney(raw: string | null): { amount: number | null; currency: string | null } {
  if (!raw) return { amount: null, currency: null };

  const m = raw.match(
    /(PKR|Rs\.?|₨|USD|\$|EUR|€|GBP|£|AED|SAR)?\s*([\d][\d,\s]*(?:\.\d{1,2})?)\s*(PKR|Rs\.?|₨|USD|EUR|GBP|AED|SAR)?/i
  );
  if (!m) return { amount: null, currency: null };

  const amount = Number(m[2].replace(/[,\s]/g, ""));
  if (!Number.isFinite(amount)) return { amount: null, currency: null };

  const token = (m[1] ?? m[3] ?? "").toLowerCase().trim();

  return { amount, currency: CURRENCY_WORDS[token] ?? null };
}

// ── What kind of mail is this ───────────────────────────────────────────────

function detectSource(subject: string, from: string, body: string): OtaSource | null {
  const hay = `${from}\n${subject}\n${body}`.toLowerCase();

  // The From header is only a hint: a manually forwarded mail carries the
  // forwarder's address, so the body markers are what actually decide.
  if (/airbnb\.com|@airbnb|\bairbnb\b/.test(hay)) return "airbnb";
  if (/booking\.com|@booking|\bbooking\.com\b/.test(hay)) return "booking_com";

  return null;
}

/** Order matters: a cancellation mail often still says "reservation confirmed". */
const KIND_RULES: { kind: OtaKind; patterns: RegExp[] }[] = [
  {
    kind: "cancellation",
    patterns: [
      /\bcancell?ed\b/i,
      /\bcancellation\b/i,
      /has been cancell?ed/i,
      /\bwithdrew\b/i,
    ],
  },
  {
    kind: "alteration",
    patterns: [
      /\balteration\b/i,
      /\bchanged (?:their|the) (?:reservation|booking|dates)\b/i,
      /\breservation (?:was |has been )?(?:changed|modified|updated)\b/i,
      /\bmodified booking\b/i,
      /\bdate change\b/i,
    ],
  },
  {
    kind: "payout",
    patterns: [
      /\byou(?:'ve| have)? been paid\b/i,
      /\bpayout (?:sent|released|of)\b/i,
      /\bwe sent you\b/i,
      /\bearnings? (?:summary|statement)\b/i,
      /\bpayment sent to your\b/i,
    ],
  },
  {
    kind: "new_booking",
    patterns: [
      /\breservation confirmed\b/i,
      /\bbooking confirmed\b/i,
      /\bnew (?:booking|reservation)\b/i,
      /\bconfirmed(?::| -)/i,
      /\bhas booked\b/i,
      /\bis coming\b/i,
    ],
  },
];

function detectKind(subject: string, body: string): OtaKind {
  // The subject is far more reliable than the body, which quotes the booking
  // details in every kind of mail — so it gets first refusal.
  for (const scope of [subject, `${subject}\n${body}`]) {
    for (const rule of KIND_RULES) {
      if (rule.patterns.some((re) => re.test(scope))) return rule.kind;
    }
  }
  return "unknown";
}

// ── Field rules, per channel ────────────────────────────────────────────────

type FieldRules = {
  listing: string[];
  guest: string[];
  phone: string[];
  checkIn: string[];
  checkOut: string[];
  guests: string[];
  gross: string[];
  payout: string[];
  code: RegExp[];
};

const RULES: Record<OtaSource, FieldRules> = {
  airbnb: {
    listing: ["Listing", "Property", "Your listing", "Place"],
    guest: ["Guest", "Guest name", "Booked by"],
    // Airbnb masks the guest's number behind its relay and does not put one in
    // this mail. The labels are here so that if it ever does, we read it.
    phone: ["Phone", "Phone number", "Contact"],
    checkIn: ["Check-in", "Checkin", "CHECK-IN", "Arrives", "Arrival"],
    checkOut: ["Check-out", "Checkout", "CHECK-OUT", "Departs", "Departure"],
    guests: ["Guests", "Number of guests"],
    gross: ["Total", "Guest paid", "Total price", "Total (PKR)"],
    payout: ["You earn", "Your payout", "Total payout", "Host payout", "Earnings"],
    // Airbnb confirmation codes are 10 characters and start HM.
    code: [
      /\bconfirmation code[:\s]+([A-Z0-9]{6,12})\b/i,
      /\b(HM[A-Z0-9]{8})\b/,
    ],
  },
  booking_com: {
    listing: ["Property", "Property name", "Hotel", "Listing", "Room"],
    guest: ["Guest name", "Guest", "Booker name", "Booked by"],
    phone: ["Phone", "Phone number", "Guest phone", "Telephone", "Mobile"],
    checkIn: ["Check-in", "Arrival", "Arrival date", "Check in"],
    checkOut: ["Check-out", "Departure", "Departure date", "Check out"],
    guests: ["Guests", "Number of guests", "Adults", "Occupancy"],
    gross: ["Total price", "Total", "Price", "Total amount"],
    payout: ["Payout", "Amount to be paid", "Your earnings"],
    // Booking.com reservation numbers are 9-10 digits.
    code: [
      /\bbooking (?:number|id|reference)[:\s#]+(\d{7,12})\b/i,
      /\breservation (?:number|id)[:\s#]+(\d{7,12})\b/i,
      /\b(\d{9,10})\b/,
    ],
  },
};

function readCode(text: string, subject: string, rules: FieldRules): string | null {
  const m = firstMatch(`${subject}\n${text}`, rules.code);
  return m ? m[1].trim() : null;
}

/**
 * The guest's name out of a subject like "Reservation confirmed: Ayesha arrives
 * 3 Jul". Used only when no labelled value was found, which is the common case
 * for Airbnb — its body puts the name in a styled heading with no label at all.
 */
function guestFromSubject(subject: string): string | null {
  const m = firstMatch(subject, [
    /(?:reservation|booking) confirmed[:\s-]+([A-Z][\p{L}'’.-]*(?:\s+[A-Z][\p{L}'’.-]*)?)\s+(?:arrives|is arriving|arriving)/iu,
    /^([A-Z][\p{L}'’.-]*(?:\s+[A-Z][\p{L}'’.-]*)?)\s+(?:has booked|booked|arrives|is coming)/iu,
    /(?:new booking|new reservation)(?:\s+from)?[:\s-]+([A-Z][\p{L}'’.-]*(?:\s+[A-Z][\p{L}'’.-]*)?)/iu,
  ]);
  return m ? m[1].trim() : null;
}

/**
 * The listing out of prose, for the very common case where the mail never
 * labels it: "Ayesha is coming to Gulberg Heights Loft."
 *
 * This matters more than it looks. The listing is what routes the mail to a
 * property, so without it every Airbnb reservation lands unassigned.
 */
function listingFromBody(text: string): string | null {
  const m = firstMatch(text, [
    /\b(?:is coming to|are coming to|arriving at|arrives at)\s+([^\n.!?]{3,90})/i,
    /\b(?:reservation|booking|stay) (?:at|for)\s+([^\n.!?]{3,90})/i,
    /\byour listing[,:\s]+([^\n.!?]{3,90})/i,
  ]);
  return m ? m[1].trim().replace(/[\s,–—-]+$/, "") : null;
}

/** The guest out of the same prose, when no label and no subject gave one. */
function guestFromBody(text: string): string | null {
  const m = firstMatch(text, [
    /^([A-Z][\p{L}'’.-]*(?:\s+[A-Z][\p{L}'’.-]*)?)\s+(?:is coming to|has booked|booked your|arrives|cancell?ed)/imu,
  ]);
  return m ? m[1].trim() : null;
}

// ── The one entry point ─────────────────────────────────────────────────────

export function parseOtaEmail(input: {
  subject: string;
  from: string;
  textBody: string;
  htmlBody: string;
  receivedAt?: Date;
}): ParseOutcome {
  const subject = (input.subject ?? "").trim();
  const body = (input.textBody?.trim() || htmlToText(input.htmlBody ?? "")).trim();
  const reference = input.receivedAt ?? new Date();

  const empty: ParsedReservation = {
    listing: null, guest_name: null, guest_phone: null,
    check_in: null, check_out: null, guests: null,
    currency: null, gross: null, host_payout: null, reservation_code: null,
  };

  const source = detectSource(subject, input.from ?? "", body);
  if (!source) {
    return { source: null, kind: "unknown", parsed: empty, error: "Not an Airbnb or Booking.com email." };
  }

  const kind = detectKind(subject, body);
  const rules = RULES[source];

  const gross = labelledMoney(body, rules.gross);
  const payout = labelledMoney(body, rules.payout);

  const guestsRaw = labelled(body, rules.guests);
  const guestsMatch = guestsRaw?.match(/\d+/);

  const parsed: ParsedReservation = {
    listing: labelled(body, rules.listing) ?? listingFromBody(body),
    // Body before subject: Airbnb's subject line carries only a first name
    // ("Ayesha arrives Jul 3") where the body has the full one.
    guest_name:
      labelled(body, rules.guest) ?? guestFromBody(body) ?? guestFromSubject(subject),
    guest_phone: labelled(body, rules.phone),
    check_in: parseDate(labelled(body, rules.checkIn), reference),
    check_out: parseDate(labelled(body, rules.checkOut), reference),
    guests: guestsMatch ? Number(guestsMatch[0]) : null,
    currency: gross.currency ?? payout.currency,
    gross: gross.amount,
    host_payout: payout.amount,
    reservation_code: readCode(body, subject, rules),
  };

  if (kind === "unknown") {
    return { source, kind, parsed, error: "Could not tell what this email is about." };
  }

  // A payout mail has no stay in it, so it is judged on its own terms.
  if (kind === "payout") {
    return {
      source,
      kind,
      parsed,
      error: parsed.host_payout === null ? "No payout amount found." : null,
    };
  }

  // What has to be there for a human to act on this at all. Anything short of
  // it goes to the inbox as `failed` with the raw mail attached, rather than
  // becoming a half-built proposal.
  const missing: string[] = [];
  if (!parsed.check_in) missing.push("check-in");
  if (!parsed.check_out) missing.push("check-out");
  if (!parsed.listing && !parsed.reservation_code) missing.push("listing");

  if (missing.length > 0) {
    return { source, kind, parsed, error: `Could not read: ${missing.join(", ")}.` };
  }

  if (parsed.check_in && parsed.check_out && parsed.check_out <= parsed.check_in) {
    return { source, kind, parsed, error: "Check-out is not after check-in." };
  }

  return { source, kind, parsed, error: null };
}
