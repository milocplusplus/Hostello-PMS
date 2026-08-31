/**
 * A small iCalendar (RFC 5545) reader — only as much as an OTA availability
 * feed uses. Airbnb, Booking.com and Vrbo all publish the same shape: a series
 * of all-day VEVENTs with a UID, a DTSTART/DTEND and a SUMMARY like
 * "Reserved" or "Airbnb (Not available)". No attendees, no recurrence.
 *
 * The one thing to get right: iCal `DTEND` is **exclusive** and
 * `calendar_blocks.end_date` is **inclusive**, so the last night is DTEND − 1.
 * That conversion happens here and nowhere else, so nothing downstream — not
 * the reconcile in SQL, not the clash check — ever sees an exclusive date.
 */

export type IcalEvent = {
  uid: string;
  /** Inclusive first night, YYYY-MM-DD. */
  start: string;
  /** Inclusive last night, YYYY-MM-DD. */
  end: string;
  summary: string | null;
};

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Joins RFC 5545 folded lines (a continuation begins with a space or tab). */
function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** RFC 5545 escaping: `\n` is a newline, and `\\` `\,` `\;` are literals. */
function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, ch: string) =>
    ch === "n" || ch === "N" ? "\n" : ch
  );
}

/** `20260901` or `20260901T140000Z` → `2026-09-01`. Anything else → null. */
function toISODate(value: string): string | null {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Parses an .ics document into date ranges. Events that are cancelled, undated
 * or backwards are dropped rather than guessed at.
 */
export function parseIcal(text: string): IcalEvent[] {
  const events: IcalEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of unfold(text)) {
    if (line.startsWith("BEGIN:VEVENT")) {
      current = {};
      continue;
    }

    if (line.startsWith("END:VEVENT")) {
      if (current) {
        const event = buildEvent(current);
        if (event) events.push(event);
      }
      current = null;
      continue;
    }

    if (!current) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;

    // "DTSTART;VALUE=DATE" → key "DTSTART"; parameters are not needed here.
    const name = line.slice(0, colon).split(";")[0].trim().toUpperCase();
    current[name] = line.slice(colon + 1);
  }

  return events;
}

function buildEvent(fields: Record<string, string>): IcalEvent | null {
  if ((fields.STATUS ?? "").trim().toUpperCase() === "CANCELLED") return null;

  const uid = (fields.UID ?? "").trim();
  const start = toISODate(fields.DTSTART ?? "");
  if (!uid || !start) return null;

  // No DTEND means a single day. DTEND is exclusive, so step back one night.
  const rawEnd = toISODate(fields.DTEND ?? "");
  const end = rawEnd ? addDaysISO(rawEnd, -1) : start;
  if (end < start) return null;

  return {
    uid,
    start,
    end,
    summary: fields.SUMMARY ? unescapeText(fields.SUMMARY).trim() || null : null,
  };
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 2_000_000;

/** Fetches one feed and returns its events, or throws a message fit for a user. */
export async function fetchFeed(url: string): Promise<IcalEvent[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8" },
    });

    if (!res.ok) {
      throw new Error(`The calendar link returned ${res.status}. Check it is still valid in Airbnb.`);
    }

    const text = await res.text();

    if (text.length > MAX_BYTES) {
      throw new Error("That calendar file is unexpectedly large — refusing to import it.");
    }

    if (!text.includes("BEGIN:VCALENDAR")) {
      throw new Error("That link did not return a calendar file. Copy the .ics export link, not the listing page.");
    }

    return parseIcal(text);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("That calendar link took too long to answer.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
