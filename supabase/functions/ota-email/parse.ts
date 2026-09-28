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
 *    parser can be run again over everything it previously got wrong;
 *  - `parse.check.ts` holds real mails (names swapped) with what each must
 *    parse to. Run it after touching anything here.
 *
 * What the two channels actually send, as of September 2026:
 *
 *  - **Airbnb** tags every mail with an `X-Template` header
 *    (`BOOKING_CONFIRMATION_TO_HOST`, `ALTERATION_ACCEPTED`, …), which decides
 *    the kind far better than the wording does. The confirmation carries the
 *    guest, dates, guest count and money; the cancellation carries dates with
 *    no year; the "reservation updated" mail carries **only** the code and the
 *    guest's first name — never the new dates or price. No mail has a phone.
 *  - **Booking.com** sends almost nothing: the reservation number, the
 *    property's name and `hotel_id`, and a date in the subject. Guest, dates
 *    and price live only in its extranet.
 *
 * Nothing here computes a payout. It reports what the channel *said*; what
 * Hostello earns is decided by `src/lib/payout.ts` when an admin approves.
 */

export type OtaSource = "airbnb" | "booking_com";

export type OtaKind = "new_booking" | "cancellation" | "alteration" | "payout" | "unknown";

export type ParsedReservation = {
  /** The listing's title as the mail prints it. Display only — it changes. */
  listing: string | null;
  /**
   * The channel's own id for the listing: Airbnb's listing number, or
   * Booking.com's `hotel_id` (a whole building, which may hold many units).
   * Stable, so this is what routes a mail to a property.
   */
  listing_id: string | null;
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
  /** What the channel kept from the host's side ("Host service fee"). */
  channel_fee: number | null;
  /** What the channel says it will send the host. */
  host_payout: number | null;
  reservation_code: string | null;
};

export type ParseOutcome = {
  source: OtaSource | null;
  kind: OtaKind;
  parsed: ParsedReservation;
  error: string | null;
  /**
   * Set when the mail is from a channel but is not about a reservation — a
   * guest's chat message. The caller drops it rather than filing it as a
   * failure for someone to dismiss.
   */
  skip: string | null;
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
  "&shy;": "",
};

/**
 * Characters the channels pad their mail with to steer inbox previews:
 * combining grapheme joiners, soft hyphens, zero-width and figure spaces.
 * Invisible, but they break every "label alone on its line" test.
 */
function clean(s: string): string {
  return s
    .replace(/[͏­​-‍⁠﻿]/g, "")
    .replace(/[     ]/g, " ")
    .replace(/[‎‏]/g, "");
}

/** HTML mail flattened to lines, because every rule below is line-oriented. */
export function htmlToText(html: string): string {
  return clean(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      // A table cell break is a field boundary, not a word boundary.
      .replace(/<\/(td|th)>/gi, "\n")
      .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ")
  )
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Where a label matched and what followed it — on the same line after a
 * colon, or on the line below (which is what a two-cell table row flattens to).
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

function labelled(rows: string[], labels: string[]): string | null {
  return labelledAt(rows, labels)?.value ?? null;
}

/**
 * Money for a label, looking at the label's own line *and* the one below it.
 *
 * The remainder of the label's line is often not money at all — "Host service
 * fee (15.5%)", "Total (USD)" — so a percentage is ignored, and an ISO code in
 * brackets there is taken as the currency of the figure below it.
 */
function labelledMoney(
  rows: string[],
  labels: string[]
): { amount: number | null; currency: string | null } {
  const hit = labelledAt(rows, labels);
  if (!hit) return { amount: null, currency: null };

  const bracketCode = hit.rest.match(/\(([A-Z]{3})\)/)?.[1] ?? null;

  for (const candidate of [hit.rest, rows[hit.index + 1] ?? ""]) {
    const money = parseMoney(candidate.replace(/\(?-?\d+(?:\.\d+)?\s*%\)?/g, ""));
    if (money.amount !== null) {
      return { amount: money.amount, currency: bracketCode ?? money.currency };
    }
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

/**
 * A stay written as a range: "Oct 8 – 11", "Oct 30 – Nov 2", "Oct 8 – 11, 2026".
 * Airbnb's cancellation mail has no other dates in it.
 */
function parseRange(
  text: string,
  reference: Date
): { check_in: string | null; check_out: string | null } {
  const m = text.match(
    /\b([A-Z][a-z]{2,8})\.?\s+(\d{1,2})\s*[–—-]\s*(?:([A-Z][a-z]{2,8})\.?\s+)?(\d{1,2})\b(?:,\s*(\d{4}))?/
  );
  if (!m || !MONTHS[m[1].slice(0, 3).toLowerCase()]) return { check_in: null, check_out: null };

  const year = m[5] ? ` ${m[5]}` : "";
  const check_in = parseDate(`${m[1]} ${m[2]}${year}`, reference);
  if (!check_in) return { check_in: null, check_out: null };

  // The end is judged against the start, so "Dec 30 – Jan 2" lands in January
  // of the following year rather than eleven months earlier.
  const check_out = parseDate(`${m[3] ?? m[1]} ${m[4]}${year}`, new Date(`${check_in}T00:00:00Z`));
  return { check_in, check_out };
}

// ── Money ───────────────────────────────────────────────────────────────────

const CURRENCY_WORDS: Record<string, string> = {
  pkr: "PKR", rs: "PKR", "rs.": "PKR", "₨": "PKR",
  usd: "USD", "us$": "USD", $: "USD",
  eur: "EUR", "€": "EUR",
  gbp: "GBP", "£": "GBP",
  aed: "AED", sar: "SAR",
};

const CUR = "PKR|Rs\\.?|₨|USD|US\\$|\\$|EUR|€|GBP|£|AED|SAR";
const NUM = "\\d[\\d,]*(?:\\.\\d{1,2})?";

/**
 * The amount on a line. A figure next to a currency mark wins over a bare
 * number, so "1 night room fee $39.00" reads as 39, not 1.
 */
export function parseMoney(raw: string | null): { amount: number | null; currency: string | null } {
  if (!raw) return { amount: null, currency: null };

  const marked =
    raw.match(new RegExp(`(${CUR})\\s*-?\\s*(${NUM})`, "i")) ??
    raw.match(new RegExp(`()(${NUM})\\s*(PKR|USD|EUR|GBP|AED|SAR)\\b`, "i"));
  const m = marked ?? raw.match(new RegExp(`()(${NUM})`));
  if (!m) return { amount: null, currency: null };

  const amount = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return { amount: null, currency: null };

  const token = (m[1] || m[3] || "").toLowerCase().trim();
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

/**
 * Airbnb's `X-Template` header, when the mail still carries it. A mail that
 * reached us through a filter keeps its headers; one forwarded by hand does
 * not, which is why the wording rules below are still needed.
 */
function kindFromTemplate(template: string): OtaKind | "skip" | null {
  const t = template.trim().toUpperCase();
  if (!t) return null;
  if (t.startsWith("MESSAGING_")) return "skip";
  if (t.startsWith("BOOKING_CONFIRMATION")) return "new_booking";
  if (t.startsWith("CANCELLATION")) return "cancellation";
  // A requested change is not yet a change; only an accepted one is.
  if (t.startsWith("ALTERATION") && t.includes("ACCEPT")) return "alteration";
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
      /\bbooking (?:was |has been )?modified\b/i,
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
      // "New booking!", and Booking.com's "New last-minute booking".
      /\bnew (?:[\w-]+ )?(?:booking|reservation)\b/i,
      /\bconfirmed(?::| -)/i,
      /\bhas booked\b/i,
      /\bis coming\b/i,
    ],
  },
];

function detectKind(subject: string, body: string): OtaKind {
  // The subject is far more reliable than the body, which quotes the booking
  // details — and the cancellation policy — in every kind of mail. So it gets
  // first refusal.
  for (const scope of [subject, `${subject}\n${body}`]) {
    for (const rule of KIND_RULES) {
      if (rule.patterns.some((re) => re.test(scope))) return rule.kind;
    }
  }
  return "unknown";
}

/** A guest writing to the host, rather than the channel reporting on a stay. */
function isGuestMessage(subject: string, body: string): boolean {
  return (
    /^re:/i.test(subject) ||
    /respond by replying directly to this email/i.test(body)
  );
}

// ── Field rules, per channel ────────────────────────────────────────────────

const NAME = "[A-Z][\\p{L}'’.-]*(?:\\s+[A-Z][\\p{L}'’.-]*){0,2}";

/**
 * The guest's name out of a subject or a sentence. Airbnb never labels it:
 * "Reservation confirmed - Ayesha Khan arrives Jul 3", "your guest Ayesha had
 * to cancel", "Your reservation with Ayesha has been updated".
 */
function guestFrom(text: string): string | null {
  const m = firstMatch(text, [
    new RegExp(`(?:reservation|booking) confirmed[:\\s-]+(${NAME})\\s+(?:arrives|is arriving|arriving)`, "iu"),
    new RegExp(`\\byour guest (${NAME}) (?:had to |has )?cancel(?:l?ed)?\\b`, "u"),
    new RegExp(`\\breservation with (${NAME}) has been (?:updated|changed)`, "iu"),
    new RegExp(`^(${NAME})\\s+(?:has booked|booked your|is coming to)`, "mu"),
  ]);
  return m ? m[1].trim() : null;
}

/**
 * The listing title: Airbnb prints it just above the room type
 * ("Entire home/apt") or the listing number, with no label of its own.
 */
function airbnbListing(rows: string[]): string | null {
  const i = rows.findIndex((r) =>
    /^(?:Entire home\/apt|Entire [a-z ]+|Private room|Shared room|Hotel room|Rental unit\b.*|Listing #\d+)$/i.test(r)
  );
  return i > 0 ? rows[i - 1] : null;
}

/** "1 adult", "2 adults, 1 child", "2 guests". Infants and pets are not guests. */
function countGuests(raw: string | null): number | null {
  if (!raw) return null;
  let total = 0;
  for (const m of raw.matchAll(/(\d+)\s*(adults?|child(?:ren)?|guests?)\b/gi)) total += Number(m[1]);
  return total > 0 ? total : null;
}

type Reader = (ctx: {
  rows: string[];
  body: string;
  raw: string;
  subject: string;
  kind: OtaKind;
  reference: Date;
}) => ParsedReservation;

const READERS: Record<OtaSource, Reader> = {
  airbnb: ({ rows, body, raw, subject, reference }) => {
    let check_in = parseDate(labelled(rows, ["Check-in", "Checkin"]), reference);
    let check_out = parseDate(labelled(rows, ["Checkout", "Check-out"]), reference);

    // The plain-text part puts both on one line: "Check-in Checkout" over
    // "Mon, Sep 28 Tue, Sep 29".
    if (!check_in || !check_out) {
      const i = rows.findIndex((r) => /^check-?in\s+check-?out$/i.test(r));
      const pair = i >= 0 ? rows[i + 1]?.match(/[A-Z][a-z]{2,8}\.? \d{1,2}(?:, \d{4})?/g) : null;
      if (pair && pair.length >= 2) {
        check_in = parseDate(pair[0], reference);
        check_out = parseDate(pair[1], check_in ? new Date(`${check_in}T00:00:00Z`) : reference);
      }
    }

    // The cancellation mail has only a range: "Oct 8 – 11, 2 guests".
    if (!check_in || !check_out) ({ check_in, check_out } = parseRange(body, reference));

    const gross = labelledMoney(rows, ["Total"]);
    const payout = labelledMoney(rows, ["You earn"]);
    const fee = labelledMoney(rows, ["Host service fee"]);

    return {
      listing: airbnbListing(rows),
      listing_id:
        firstMatch(raw, [/\bListing #(\d{6,})/, /\/rooms\/(\d{6,})/, /\/listings\/(\d{6,})/])?.[1] ??
        null,
      // Subject before body: the confirmation's subject has the full name.
      guest_name: guestFrom(subject) ?? guestFrom(body),
      // Airbnb relays messages and never puts the guest's number in a mail.
      guest_phone: null,
      check_in,
      check_out,
      guests: countGuests(labelled(rows, ["Guests"])) ?? countGuests(body.match(/\d+ guests?\b/)?.[0] ?? null),
      currency: gross.currency ?? payout.currency,
      gross: gross.amount,
      channel_fee: fee.amount,
      host_payout: payout.amount,
      // Ten characters starting HM. The "updated" mail has it only in its links.
      reservation_code: raw.match(/\b(HM[A-Z0-9]{8})\b/)?.[1] ?? null,
    };
  },

  booking_com: ({ rows, raw, subject, kind, reference }) => {
    // The property's name sits just above "Booking confirmation — 123…".
    const head = rows.findIndex((r) =>
      /^(?:booking confirmation|cancellation|modification|booking modification)\b/i.test(r)
    );
    const listing =
      rows
        .slice(0, Math.max(head, 0))
        .reverse()
        .find((r) => !/online hotel reservations|security precautions|when you sign in|tracking/i.test(r))
        ?.replace(/^Booking\.com\s+/i, "") ?? null;

    // "(5252615257, Sunday, 27 September 2026)". Read as the arrival date:
    // the cancellation keeps the date its booking mail had, so it belongs to
    // the reservation rather than to the mail.
    const subjectDate = subject.match(/\(\d{6,12},\s*([^)]+)\)/)?.[1] ?? null;

    return {
      listing,
      listing_id: raw.match(/hotel_id=(\d+)/)?.[1] ?? null,
      guest_name: labelled(rows, ["Guest name", "Booker name"]),
      guest_phone: labelled(rows, ["Phone", "Phone number", "Telephone"]),
      check_in: kind === "cancellation" ? null : parseDate(subjectDate, reference),
      check_out: null,
      guests: null,
      currency: null,
      gross: null,
      channel_fee: null,
      host_payout: null,
      reservation_code:
        firstMatch(`${subject}\n${raw}`, [
          /\((\d{6,12}),/,
          /\b(?:confirmation|cancellation|modification)\s*[—–-]\s*(\d{6,12})\b/i,
          /res_id=(\d{6,12})/,
        ])?.[1] ?? null,
    };
  },
};

// ── The one entry point ─────────────────────────────────────────────────────

const EMPTY: ParsedReservation = {
  listing: null, listing_id: null, guest_name: null, guest_phone: null,
  check_in: null, check_out: null, guests: null,
  currency: null, gross: null, channel_fee: null, host_payout: null, reservation_code: null,
};

export function parseOtaEmail(input: {
  subject: string;
  from: string;
  textBody: string;
  htmlBody: string;
  /** Airbnb's `X-Template` header, if the mail still has it. */
  template?: string;
  receivedAt?: Date;
}): ParseOutcome {
  const subject = clean(input.subject ?? "").replace(/\s+/g, " ").trim();
  // HTML first: its table cells flatten to one label per line in the case the
  // channel wrote it, where the plain-text part upper-cases headings and runs
  // cells together.
  const body =
    htmlToText(input.htmlBody ?? "") ||
    clean(input.textBody ?? "")
      // Plain-text parts print every link, and wrap tracking tokens in
      // brackets across several lines.
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .trim();
  const rows = lines(body);
  // Codes and ids often appear only inside links, which flattening drops.
  const raw = clean(`${input.textBody ?? ""}\n${(input.htmlBody ?? "").replace(/&amp;/g, "&")}`);
  const reference = input.receivedAt ?? new Date();

  const source = detectSource(subject, input.from ?? "", body);
  if (!source) {
    return { source: null, kind: "unknown", parsed: EMPTY, error: "Not an Airbnb or Booking.com email.", skip: null };
  }

  const fromTemplate = kindFromTemplate(input.template ?? "");
  if (fromTemplate === "skip" || (fromTemplate === null && isGuestMessage(subject, body))) {
    return { source, kind: "unknown", parsed: EMPTY, error: null, skip: "A guest message, not a reservation." };
  }

  const kind = fromTemplate ?? detectKind(subject, body);
  const parsed = READERS[source]({ rows, body, raw, subject, kind, reference });

  if (kind === "unknown") {
    return { source, kind, parsed, error: "Could not tell what this email is about.", skip: null };
  }

  // A payout mail has no stay in it, so it is judged on its own terms.
  if (kind === "payout") {
    return {
      source,
      kind,
      parsed,
      error: parsed.host_payout === null ? "No payout amount found." : null,
      skip: null,
    };
  }

  // What has to be there for a human to act on this at all. Anything short of
  // it goes to the inbox as `failed` with the raw mail attached, rather than
  // becoming a half-built proposal.
  //
  // Only an Airbnb confirmation is expected to carry the dates. Every other
  // mail is found by its code, and its dates come from the booking it names or
  // from the channel's calendar.
  const missing: string[] = [];
  if (!parsed.reservation_code) missing.push("confirmation code");
  if (source === "airbnb" && kind === "new_booking") {
    if (!parsed.check_in) missing.push("check-in");
    if (!parsed.check_out) missing.push("check-out");
  }

  if (missing.length > 0) {
    return { source, kind, parsed, error: `Could not read: ${missing.join(", ")}.`, skip: null };
  }

  if (parsed.check_in && parsed.check_out && parsed.check_out <= parsed.check_in) {
    return { source, kind, parsed, error: "Check-out is not after check-in.", skip: null };
  }

  return { source, kind, parsed, error: null, skip: null };
}
