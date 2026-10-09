"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import type { BusinessContact } from "@/lib/settings-shared";
import { formatDayMonth } from "@/lib/calendar";
import { formatPKR } from "@/lib/payout";
import { FIX_AREAS, againstMiddle, pricedHigh } from "@/lib/listing-coach";
import { canvasToJpeg, pagesToPdfBlob, sharePdf, type PdfPage } from "@/lib/pdf";
import {
  CW,
  H,
  M,
  PAD,
  W,
  clip,
  footer,
  gridHeader,
  gridRow,
  masthead,
  page,
  readTheme,
  rr,
  tile,
  type PdfHead,
} from "@/components/shared/StatementPdf";
import type { CoachFix, CoachReport } from "@/components/admin/CoachListing";

/**
 * One listing's findings and suggestions as a PDF, for the admin to keep or
 * hand to the unit's owner. It only draws what the last check and the last
 * audit saved; nothing here reads Airbnb or works a figure out again.
 *
 * Unlike the statement, most of it is prose of unknown length, so the pages
 * are filled by a cursor that breaks when the next piece will not fit.
 */

export type CoachReportData = {
  unitName: string;
  /** Newest first, as the listing page loads them. */
  reports: CoachReport[];
  fixes: CoachFix[];
  business?: BusinessContact;
};

/** Past checks listed; older ones are counted under the table. */
const HISTORY_ROWS = 12;
const LINE = 28;

const num = (v: unknown) => (v == null ? null : Number(v));
const dollars = (v: number | null) => (v == null ? "—" : `$${Math.round(v)}`);

function longDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Breaks text into lines that fit, keeping the writer's own line breaks. */
function wrap(c: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && c.measureText(next).width > max) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

/** Exported so the drawing can be exercised without going through the button. */
export async function renderCoachPages(d: CoachReportData): Promise<PdfPage[]> {
  await document.fonts.ready;
  const t = readTheme();
  const latest = d.reports[0];
  // The summary, titles and description come from the monthly audit, not every week.
  const audit = d.reports.find((r) => r.audited);
  const rate = num(latest.usd_pkr);
  const open = d.fixes.filter((f) => !f.confirmed_on && !f.done_at);
  const ticked = d.fixes.filter((f) => !f.confirmed_on && f.done_at).length;
  const confirmed = d.fixes.filter((f) => f.confirmed_on).length;

  const head: PdfHead = {
    brand: d.business?.name ?? "Hostello",
    kicker: "AIRBNB LISTING REPORT",
    title: d.unitName,
    sub: `Checked ${longDate(latest.run_on)}`,
    note: "Read from Airbnb's public pages on the day of the check. Search position differs a little between visitors.",
    contact: d.business?.line ?? null,
  };

  const canvases: HTMLCanvasElement[] = [];
  const BOTTOM = H - 112;
  let c!: CanvasRenderingContext2D;
  let y = 0;
  const newPage = () => {
    const p = page(t);
    canvases.push(p.canvas);
    c = p.c;
    y = masthead(c, t, head, canvases.length > 1) + 50;
  };
  /** Starts a new page when the next `h` pixels would run into the footer. */
  const need = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };

  /** `under` is the room the heading wants below it, so it never ends a page alone. */
  const heading = (text: string, under = 100) => {
    need(90 + under);
    y += 16;
    c.fillStyle = t.ink;
    c.font = `500 26px ${t.font}`;
    c.fillText(text, M, y + 26);
    c.fillStyle = t.gold;
    c.fillRect(M, y + 42, 34, 2);
    y += 74;
  };

  const para = (text: string, o: { color?: string; weight?: number; size?: number; gap?: number } = {}) => {
    const size = o.size ?? 18;
    const font = `${o.weight ?? 400} ${size}px ${t.font}`;
    c.font = font;
    for (const line of wrap(c, text, CW)) {
      need(LINE);
      c.font = font;
      c.fillStyle = o.color ?? t.dim;
      c.fillText(clip(c, line, CW), M, y + size);
      y += LINE;
    }
    y += o.gap ?? 14;
  };

  const lineCount = (text: string, weight: number) => {
    c.font = `${weight} 18px ${t.font}`;
    return wrap(c, text, CW).length;
  };

  // ── The numbers ───────────────────────────────────────────────────────────
  newPage();

  if (latest.title) {
    c.fillStyle = t.muted;
    c.font = `500 14px ${t.font}`;
    c.letterSpacing = "1.5px";
    c.fillText("ON AIRBNB AS", M, y + 14);
    c.letterSpacing = "0px";
    c.fillStyle = t.ink;
    c.font = `500 22px ${t.font}`;
    c.fillText(clip(c, latest.title, CW), M, y + 48);
    y += 80;
  }

  const price = (usd: number | null, middle: number | null): [string, string, string] => [
    usd == null ? "—" : rate ? formatPKR(Math.round(usd * rate)) : dollars(usd),
    usd == null
      ? "Not available on those dates"
      : [rate ? dollars(usd) : null, againstMiddle(usd, middle)].filter(Boolean).join(" · ") ||
        "No competitor prices yet",
    pricedHigh(usd, middle) ? t.negative : t.gold,
  ];
  const weekend = price(num(latest.weekend_usd), num(latest.weekend_median_usd));
  const weekday = price(num(latest.weekday_usd), num(latest.weekday_median_usd));
  const moved = latest.position_change ?? 0;
  const from = (iso: string | null) => (iso ? ` from ${formatDayMonth(iso)}` : "");

  const tiles: [string, string, string, string][] = [
    [
      "Rating",
      latest.rating != null ? Number(latest.rating).toFixed(2) : "New",
      latest.review_count === 1 ? "1 review" : `${latest.review_count ?? 0} reviews`,
      t.gold,
    ],
    [
      "Search position",
      latest.search_pages === 0
        ? "—"
        : latest.search_position != null
          ? `#${latest.search_position}`
          : `${latest.search_pages * 18}+`,
      latest.search_pages === 0
        ? "Not checked"
        : moved === 0
          ? "For the coming weekend"
          : `${moved > 0 ? `Down ${moved}` : `Up ${-moved}`} since the check before`,
      moved > 0 ? t.negative : moved < 0 ? t.positive : t.glow,
    ],
    [`Weekend${from(latest.weekend_from)}, 2 nights`, ...weekend],
    [`Weekday${from(latest.weekday_from)}, 2 nights`, ...weekday],
  ];
  const tw = (CW - 20) / 2;
  tiles.forEach((x, i) => {
    tile(c, t, M + (i % 2) * (tw + 20), y + Math.floor(i / 2) * 160, tw, 140, x[0], x[1], x[2], x[3]);
  });
  y += 340;

  if (audit?.summary) {
    heading("In short");
    // Written at the audit, so it can speak of figures a later check has moved.
    if (audit !== latest) para(`From the audit on ${longDate(audit.run_on)}.`, { color: t.muted, size: 15, gap: 6 });
    para(audit.summary, { color: t.ink });
  }

  // ── Weekend price beside each competitor's, cheapest first ────────────────
  const mine = num(latest.weekend_usd);
  const middle = num(latest.weekend_median_usd);
  const bars = [
    ...(mine != null ? [{ label: "This listing", usd: mine, mine: true }] : []),
    ...latest.competitors
      .filter((x) => x.weekend_usd != null)
      .map((x) => ({ label: x.title ?? "Airbnb listing", usd: Number(x.weekend_usd), mine: false })),
  ].sort((a, b) => a.usd - b.usd);
  // One row is not a comparison.
  if (bars.length >= 2) {
    heading("Weekend price against similar listings", bars.length * 40 + 50);
    const max = Math.max(...bars.map((b) => b.usd));
    const bx = M + 360;
    const bw = CW - 360 - 90;
    for (const b of bars) {
      c.font = `${b.mine ? 500 : 400} 17px ${t.font}`;
      c.fillStyle = b.mine ? t.ink : t.dim;
      c.fillText(clip(c, b.label, 340), M, y + 24);
      c.fillStyle = b.mine ? t.gold : "rgba(255,255,255,0.22)";
      rr(c, bx, y + 12, Math.max(4, (bw * b.usd) / max), 14, 4);
      c.fill();
      if (middle != null) {
        c.fillStyle = "rgba(255,255,255,0.55)";
        c.fillRect(bx + (bw * Math.min(middle, max)) / max, y, 2, 40);
      }
      c.textAlign = "right";
      c.fillStyle = b.mine ? t.ink : t.dim;
      c.fillText(dollars(b.usd), W - M, y + 24);
      c.textAlign = "left";
      y += 40;
    }
    y += 12;
    if (middle != null) {
      para(
        `The line marks the middle price, ${dollars(middle)}: half of these listings charge more and half less.`,
        { color: t.muted, size: 15 }
      );
    }
  }

  // ── Fixes ─────────────────────────────────────────────────────────────────
  // A fix stays on one page unless it is too long to ever fit on one.
  const fixHeight = (f: CoachFix) =>
    Math.min(34 + (lineCount(f.issue, 500) + lineCount(`What to do: ${f.fix}`, 400)) * LINE + 30, 900);
  heading("Fixes to make", open[0] ? fixHeight(open[0]) : 100);
  if (open.length === 0) {
    para("Nothing to fix right now. The next audit looks again.");
  }
  open.forEach((f, i) => {
    const todo = `What to do: ${f.fix}`;
    need(fixHeight(f));
    c.font = `500 14px ${t.font}`;
    c.letterSpacing = "1.5px";
    c.fillStyle = t.gold;
    const area = `${i + 1} · ${(FIX_AREAS[f.area] ?? f.area).toUpperCase()}`;
    c.fillText(area, M, y + 14);
    if (f.reopened_on) {
      const after = M + c.measureText(area).width;
      c.fillStyle = t.negative;
      c.fillText(` · STILL THERE ON ${formatDayMonth(f.reopened_on).toUpperCase()}`, after, y + 14);
    }
    c.letterSpacing = "0px";
    y += 34;
    para(f.issue, { color: t.ink, weight: 500, gap: 4 });
    para(todo, { gap: 12 });
    if (i < open.length - 1) {
      c.fillStyle = t.line;
      c.fillRect(M, y, CW, 1);
      y += 18;
    }
  });
  const fixNote = [
    ticked > 0 ? `${ticked} marked done, waiting for the next audit to check` : null,
    confirmed > 0 ? `${confirmed} confirmed fixed by an audit` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (fixNote) para(fixNote, { color: t.muted, size: 15 });

  // ── Suggested wording ─────────────────────────────────────────────────────
  if (audit && (audit.title_options.length > 0 || audit.suggested_description)) {
    heading("Suggested wording");
    para(`From the audit on ${longDate(audit.run_on)}.`, { color: t.muted, size: 15 });
    if (audit.title_options.length > 0) {
      para("Title, pick one", { color: t.ink, weight: 500, gap: 6 });
      for (const option of audit.title_options) {
        need(64);
        c.fillStyle = t.card;
        rr(c, M, y, CW, 52, 10);
        c.fill();
        c.fillStyle = t.ink;
        c.font = `400 18px ${t.font}`;
        c.fillText(clip(c, option, CW - PAD * 2), M + PAD, y + 33);
        y += 64;
      }
      y += 10;
    }
    if (audit.suggested_description) {
      para("Description", { color: t.ink, weight: 500, gap: 6 });
      para(audit.suggested_description);
    }
  }

  // ── Competitors ───────────────────────────────────────────────────────────
  if (latest.competitors.length > 0) {
    const cols = [520, 130, 130, 150, 150];
    const stars = (v: number | null) => (v != null ? Number(v).toFixed(2) : "New");
    heading("Similar listings checked", 46 + (latest.competitors.length + 2) * 44 + 50);
    y = gridHeader(c, t, y, cols, ["Listing", "Rating", "Reviews", "Weekend", "Weekday"], 1);
    y = gridRow(
      c,
      t,
      y,
      cols,
      [
        { text: "This listing", color: t.ink, weight: 500 },
        { text: stars(latest.rating), color: t.ink },
        { text: String(latest.review_count ?? 0), color: t.ink },
        { text: dollars(mine), color: t.goldBright, weight: 500 },
        { text: dollars(num(latest.weekday_usd)), color: t.goldBright, weight: 500 },
      ],
      1,
      false
    );
    latest.competitors.forEach((x, i) => {
      y = gridRow(
        c,
        t,
        y,
        cols,
        [
          { text: x.title ?? "Airbnb listing" },
          { text: stars(x.rating) },
          { text: String(x.reviews ?? 0) },
          { text: dollars(num(x.weekend_usd)) },
          { text: dollars(num(x.weekday_usd)) },
        ],
        1,
        i % 2 === 0
      );
    });
    y = gridRow(
      c,
      t,
      y,
      cols,
      [
        { text: "Middle price of the listings above", color: t.muted },
        { text: "" },
        { text: "" },
        { text: dollars(middle), color: t.ink },
        { text: dollars(num(latest.weekday_median_usd)), color: t.ink },
      ],
      1,
      false
    );
    y += 16;
    para(
      `Prices are in US dollars as Airbnb showed them, for two nights.${
        rate ? ` A dollar was Rs ${rate.toFixed(2)} that day.` : ""
      }`,
      { color: t.muted, size: 15 }
    );
  }

  // ── Past checks ───────────────────────────────────────────────────────────
  if (d.reports.length > 1) {
    const cols = [300, 195, 195, 130, 130, 130];
    const shown = d.reports.slice(0, HISTORY_ROWS);
    heading("Past checks", 46 + shown.length * 44 + 50);
    y = gridHeader(c, t, y, cols, ["Checked", "Weekend", "Middle price", "Search", "Rating", "Reviews"], 1);
    shown.forEach((r, i) => {
      y = gridRow(
        c,
        t,
        y,
        cols,
        [
          { text: `${longDate(r.run_on)}${r.audited ? " · audit" : ""}`, color: t.ink },
          { text: dollars(num(r.weekend_usd)), color: r.price_flag ? t.negative : undefined },
          { text: dollars(num(r.weekend_median_usd)) },
          { text: r.search_pages === 0 ? "—" : String(r.search_position ?? `${r.search_pages * 18}+`) },
          { text: r.rating != null ? Number(r.rating).toFixed(2) : "New" },
          { text: String(r.review_count ?? 0) },
        ],
        1,
        i % 2 === 1
      );
    });
    y += 16;
    if (d.reports.length > shown.length) {
      const more = d.reports.length - shown.length;
      para(`+ ${more} earlier ${more === 1 ? "check" : "checks"}`, { color: t.muted, size: 15 });
    }
  }

  // The page count is only known once everything has been placed.
  canvases.forEach((canvas, i) => footer(canvas.getContext("2d")!, t, head, i + 1, canvases.length));

  return Promise.all(
    canvases.map(async (canvas) => ({
      jpeg: await canvasToJpeg(canvas),
      width: canvas.width,
      height: canvas.height,
    }))
  );
}

export function CoachReportPdf({ data, filename }: { data: CoachReportData; filename: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await sharePdf(pagesToPdfBlob(await renderCoachPages(data)), filename, "Airbnb listing report");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // a cancelled share
      setError("Could not build the PDF. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <span className="text-[11px] text-negative">{error}</span>}
      <button type="button" onClick={save} disabled={busy} className="btn btn-ghost btn-sm disabled:opacity-40">
        <FileText size={13} aria-hidden />
        {busy ? "Building…" : "Report"}
      </button>
    </>
  );
}
