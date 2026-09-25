"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import { formatDayMonth } from "@/lib/calendar";
import { formatShortStayWindow, rowShortStay, departureDate } from "@/lib/short-stay";
import { sourceLabel } from "@/lib/block-sources";
import { canvasToJpeg, pagesToPdfBlob, type PdfPage } from "@/lib/pdf";
import type { StatementReport, ReportRow } from "@/lib/statement-report";

/**
 * The owner's monthly report, drawn.
 *
 * A4 at 150 DPI — 1240 × 1754 — so the page prints at its real size rather than
 * as a poster, and `pdf.ts` scales points to match. Page one is the picture of
 * the month; every page after it is the itemised list, which is what makes this
 * worth sending rather than just showing.
 *
 * Colours are read off the live theme rather than restated here, so the report
 * cannot drift from the app: `sourceColor()` stays the one definition of what
 * Airbnb's pink is.
 */

const W = 1240;
const H = 1754;
const M = 80; // margin
const CW = W - M * 2; // content width

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** `var(--x)` → the hex the theme currently gives it. */
function resolve(value: string): string {
  const m = value.match(/^var\((--[^)]+)\)$/);
  return (m ? cssVar(m[1]) : value) || "#8b5cf6";
}

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Truncates to fit, with an ellipsis, so nothing ever spills its column. */
function clip(c: CanvasRenderingContext2D, text: string, max: number): string {
  if (c.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && c.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s + "…";
}

type Theme = {
  font: string;
  bg: string;
  card: string;
  raised: string;
  ink: string;
  dim: string;
  muted: string;
  gold: string;
  goldBright: string;
  purple: string;
  purpleDeep: string;
  glow: string;
  positive: string;
  line: string;
};

function readTheme(): Theme {
  const font = getComputedStyle(document.body).fontFamily ||
    "ui-sans-serif, system-ui, sans-serif";
  return {
    font,
    bg: cssVar("--color-surface-0") || "#0a0910",
    card: cssVar("--color-surface-1") || "#15121f",
    raised: cssVar("--color-surface-2") || "#1e1a2c",
    ink: "#f4f2f8",
    dim: "#b3aec4",
    muted: "#7d7790",
    gold: cssVar("--color-hostello-gold") || "#c9a44c",
    goldBright: cssVar("--color-hostello-gold-bright") || "#f0c869",
    purple: cssVar("--color-hostello-purple") || "#2e1a4d",
    purpleDeep: cssVar("--color-hostello-purple-deep") || "#1c0f30",
    glow: cssVar("--color-hostello-purple-glow") || "#8b5cf6",
    positive: cssVar("--color-positive") || "#34d399",
    line: "rgba(255,255,255,0.08)",
  };
}

/** The texture: a fine dot grid, barely there, over the dark ground. */
function dots(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a = 0.05) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.fillStyle = `rgba(255,255,255,${a})`;
  for (let gy = y; gy < y + h; gy += 14) {
    for (let gx = x; gx < x + w; gx += 14) {
      c.beginPath();
      c.arc(gx, gy, 1, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

function page(t: Theme): { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;
  c.fillStyle = t.bg;
  c.fillRect(0, 0, W, H);
  c.textBaseline = "alphabetic";
  return { canvas, c };
}

function masthead(c: CanvasRenderingContext2D, t: Theme, r: StatementReport, compact: boolean) {
  const h = compact ? 150 : 300;

  const g = c.createLinearGradient(0, 0, W, h);
  g.addColorStop(0, t.purpleDeep);
  g.addColorStop(0.55, t.purple);
  g.addColorStop(1, t.bg);
  c.fillStyle = g;
  c.fillRect(0, 0, W, h);

  const glow = c.createRadialGradient(W - 180, 40, 10, W - 180, 40, compact ? 260 : 420);
  glow.addColorStop(0, "rgba(201,164,76,0.32)");
  glow.addColorStop(1, "rgba(201,164,76,0)");
  c.fillStyle = glow;
  c.fillRect(0, 0, W, h);

  dots(c, 0, 0, W, h, 0.05);

  // A pair of oversized outlined rings, the mark's own geometry used as a motif.
  c.save();
  c.strokeStyle = "rgba(255,255,255,0.06)";
  c.lineWidth = 2;
  c.beginPath();
  c.arc(W - 120, h - 30, 190, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.arc(W - 120, h - 30, 270, 0, Math.PI * 2);
  c.stroke();
  c.restore();

  c.fillStyle = t.gold;
  c.fillRect(0, h - 3, W, 3);

  c.fillStyle = t.ink;
  c.font = `500 ${compact ? 22 : 26}px ${t.font}`;
  c.letterSpacing = "6px";
  c.fillText("HOSTELLO", M, compact ? 62 : 86);
  c.letterSpacing = "0px";

  if (compact) {
    c.fillStyle = t.dim;
    c.font = `400 20px ${t.font}`;
    c.fillText(`${r.clientName} · ${r.monthLabel}`, M, 104);
    return h;
  }

  c.fillStyle = t.gold;
  c.font = `500 15px ${t.font}`;
  c.letterSpacing = "3px";
  c.fillText("OWNER STATEMENT", M, 124);
  c.letterSpacing = "0px";

  c.fillStyle = t.ink;
  c.font = `500 52px ${t.font}`;
  c.fillText(clip(c, r.clientName, CW - 60), M, 190);

  c.fillStyle = t.dim;
  c.font = `400 26px ${t.font}`;
  c.fillText(r.monthLabel, M, 232);

  c.fillStyle = t.muted;
  c.font = `400 17px ${t.font}`;
  c.fillText(
    `Prepared ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
    M,
    264
  );

  return h;
}

function footer(c: CanvasRenderingContext2D, t: Theme, r: StatementReport, n: number, of: number) {
  c.fillStyle = t.line;
  c.fillRect(M, H - 96, CW, 1);
  c.fillStyle = t.muted;
  c.font = `400 16px ${t.font}`;
  c.fillText(`${r.clientName} · ${r.monthLabel}`, M, H - 62);
  c.textAlign = "right";
  c.fillText(`Page ${n} of ${of}`, W - M, H - 62);
  c.textAlign = "left";
  c.font = `400 14px ${t.font}`;
  c.fillStyle = "rgba(255,255,255,0.22)";
  c.fillText("Figures are your share. Hostello's commission is not shown.", M, H - 36);
}

function tile(
  c: CanvasRenderingContext2D,
  t: Theme,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  sub: string,
  accent: string
) {
  c.fillStyle = t.card;
  rr(c, x, y, w, h, 14);
  c.fill();
  c.strokeStyle = t.line;
  c.lineWidth = 1;
  c.stroke();

  c.save();
  rr(c, x, y, w, h, 14);
  c.clip();
  const g = c.createRadialGradient(x + 30, y, 4, x + 30, y, w);
  g.addColorStop(0, accent + "38");
  g.addColorStop(1, accent + "00");
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  c.restore();

  c.fillStyle = accent;
  rr(c, x, y + 16, 3, 26, 2);
  c.fill();

  c.fillStyle = t.muted;
  c.font = `500 14px ${t.font}`;
  c.letterSpacing = "1.5px";
  c.fillText(label.toUpperCase(), x + 20, y + 38);
  c.letterSpacing = "0px";

  c.fillStyle = t.ink;
  c.font = `500 34px ${t.font}`;
  c.fillText(clip(c, value, w - 40), x + 20, y + 88);

  c.fillStyle = t.dim;
  c.font = `400 15px ${t.font}`;
  c.fillText(clip(c, sub, w - 40), x + 20, y + 118);
}

function panel(
  c: CanvasRenderingContext2D,
  t: Theme,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string
) {
  c.fillStyle = t.card;
  rr(c, x, y, w, h, 14);
  c.fill();
  c.strokeStyle = t.line;
  c.lineWidth = 1;
  c.stroke();
  dots(c, x, y, w, h, 0.022);

  c.fillStyle = t.ink;
  c.font = `500 20px ${t.font}`;
  c.fillText(title, x + 24, y + 42);
  c.fillStyle = t.gold;
  c.fillRect(x + 24, y + 56, 34, 2);
}

function trend(
  c: CanvasRenderingContext2D,
  t: Theme,
  r: StatementReport,
  x: number,
  y: number,
  w: number,
  h: number
) {
  panel(c, t, x, y, w, h, "Payout through the month");

  const px = x + 30;
  const py = y + 86;
  const pw = w - 60;
  const ph = h - 140;
  const max = Math.max(...r.cumulativePayout, 1);
  const n = r.cumulativePayout.length;

  c.strokeStyle = "rgba(255,255,255,0.05)";
  c.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gy = py + (ph / 4) * i;
    c.beginPath();
    c.moveTo(px, gy);
    c.lineTo(px + pw, gy);
    c.stroke();
  }

  if (max <= 1) {
    c.fillStyle = t.muted;
    c.font = `400 17px ${t.font}`;
    c.fillText("No payout recorded this month.", px, py + ph / 2);
    return;
  }

  const at = (i: number) => ({
    x: px + (pw * i) / Math.max(1, n - 1),
    y: py + ph - (ph * r.cumulativePayout[i]) / max,
  });

  c.beginPath();
  c.moveTo(px, py + ph);
  for (let i = 0; i < n; i++) {
    const p = at(i);
    c.lineTo(p.x, p.y);
  }
  c.lineTo(px + pw, py + ph);
  c.closePath();
  const g = c.createLinearGradient(0, py, 0, py + ph);
  g.addColorStop(0, t.gold + "5c");
  g.addColorStop(1, t.gold + "00");
  c.fillStyle = g;
  c.fill();

  c.beginPath();
  for (let i = 0; i < n; i++) {
    const p = at(i);
    if (i === 0) c.moveTo(p.x, p.y);
    else c.lineTo(p.x, p.y);
  }
  c.strokeStyle = t.goldBright;
  c.lineWidth = 3;
  c.lineJoin = "round";
  c.stroke();

  const end = at(n - 1);
  c.fillStyle = t.goldBright;
  c.beginPath();
  c.arc(end.x, end.y, 6, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = t.muted;
  c.font = `400 15px ${t.font}`;
  c.fillText(formatDayMonth(r.days[0]), px, py + ph + 30);
  c.textAlign = "right";
  c.fillText(formatDayMonth(r.days[n - 1]), px + pw, py + ph + 30);
  c.fillStyle = t.dim;
  c.font = `500 17px ${t.font}`;
  c.fillText(formatPKR(r.totals.payout), px + pw, py - 18);
  c.textAlign = "left";
}

function donut(
  c: CanvasRenderingContext2D,
  t: Theme,
  r: StatementReport,
  x: number,
  y: number,
  w: number,
  h: number
) {
  panel(c, t, x, y, w, h, "Where the bookings came from");

  const total = r.sources.reduce((s, v) => s + v.gross, 0);
  if (total <= 0) {
    c.fillStyle = t.muted;
    c.font = `400 17px ${t.font}`;
    c.fillText("No bookings this month.", x + 26, y + 120);
    return;
  }

  const cx = x + 118;
  const cy = y + 190;
  const R = 78;
  let a = -Math.PI / 2;

  for (const s of r.sources) {
    const slice = (s.gross / total) * Math.PI * 2;
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, R, a, a + slice);
    c.closePath();
    c.fillStyle = resolve(s.color);
    c.fill();
    a += slice;
  }

  c.globalCompositeOperation = "destination-out";
  c.beginPath();
  c.arc(cx, cy, 46, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = "source-over";

  c.textAlign = "center";
  c.fillStyle = t.ink;
  c.font = `500 26px ${t.font}`;
  c.fillText(String(r.totals.stays), cx, cy + 2);
  c.fillStyle = t.muted;
  c.font = `400 13px ${t.font}`;
  c.fillText(r.totals.stays === 1 ? "stay" : "stays", cx, cy + 22);
  c.textAlign = "left";

  const top = r.sources.slice(0, 5);
  let ly = y + 110;
  for (const s of top) {
    c.fillStyle = resolve(s.color);
    rr(c, x + 228, ly - 11, 12, 12, 3);
    c.fill();
    c.fillStyle = t.dim;
    c.font = `400 16px ${t.font}`;
    c.fillText(clip(c, s.label, w - 340), x + 250, ly);
    c.textAlign = "right";
    c.fillStyle = t.ink;
    c.fillText(`${Math.round((s.gross / total) * 100)}%`, x + w - 26, ly);
    c.textAlign = "left";
    ly += 34;
  }

  // The donut draws every source; the legend only has room for five. Without
  // this the percentages visibly fail to reach 100 and the reader is left to
  // wonder what the unlabelled wedge was.
  const rest = r.sources.slice(5);
  if (rest.length > 0) {
    const restGross = rest.reduce((s, v) => s + v.gross, 0);
    c.fillStyle = t.muted;
    c.font = `400 15px ${t.font}`;
    c.fillText(`+ ${rest.length} more`, x + 250, ly);
    c.textAlign = "right";
    c.fillText(`${Math.round((restGross / total) * 100)}%`, x + w - 26, ly);
    c.textAlign = "left";
  }
}

function unitBars(
  c: CanvasRenderingContext2D,
  t: Theme,
  r: StatementReport,
  x: number,
  y: number,
  w: number,
  h: number,
  soldOnly: boolean
) {
  panel(c, t, x, y, w, h, "How each unit did");

  // An owner with eleven units and two that sold spends three of five rows on
  // empty bars. Which units earned nothing is worth knowing, so it is still
  // said — as a count, not as rows.
  const sold = r.units.filter((u) => u.payout > 0);
  const idle = r.units.length - sold.length;
  const pool = soldOnly ? sold : r.units;

  const shown = pool.slice(0, 5);
  const max = Math.max(...shown.map((u) => u.payout), 1);

  if (shown.length === 0) {
    c.fillStyle = t.muted;
    c.font = `400 17px ${t.font}`;
    c.fillText(
      r.units.length === 0 ? "No units on the account." : "No unit sold a night this month.",
      x + 26,
      y + 120
    );
    return;
  }

  let by = y + 104;
  for (const u of shown) {
    // The nights ride on the unit's own line. Below the bar they sat closer to
    // the next unit's name than to this one, and read as labelling that.
    c.fillStyle = t.dim;
    c.font = `400 16px ${t.font}`;
    const nights = `${u.nights} ${u.nights === 1 ? "night" : "nights"}`;
    const name = clip(c, u.name, w - 230);
    c.fillText(name, x + 26, by);
    const after = x + 26 + c.measureText(name).width;
    c.fillStyle = t.muted;
    c.font = `400 13px ${t.font}`;
    c.fillText(`· ${nights}`, after + 8, by);

    c.textAlign = "right";
    c.fillStyle = t.ink;
    c.font = `500 16px ${t.font}`;
    c.fillText(formatPKR(u.payout), x + w - 26, by);
    c.textAlign = "left";

    const bw = w - 52;
    c.fillStyle = "rgba(255,255,255,0.06)";
    rr(c, x + 26, by + 14, bw, 10, 5);
    c.fill();

    const fill = Math.max(4, (bw * u.payout) / max);
    const g = c.createLinearGradient(x + 26, 0, x + 26 + fill, 0);
    g.addColorStop(0, t.glow);
    g.addColorStop(1, t.gold);
    c.fillStyle = g;
    rr(c, x + 26, by + 14, fill, 10, 5);
    c.fill();

    by += 52;
  }

  const overflow = pool.length - shown.length;
  const note = [
    overflow > 0 ? `+ ${overflow} more` : null,
    // Only worth saying when the empty ones were left out; otherwise they are
    // sitting right there on screen with their zeroes.
    soldOnly && idle > 0 ? `${idle} unit${idle === 1 ? "" : "s"} sold nothing` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (note) {
    c.fillStyle = t.muted;
    c.font = `400 14px ${t.font}`;
    c.fillText(note, x + 26, by + 6);
  }
}

/**
 * Six columns, not seven. Status used to have its own and squeezed the two
 * money columns until "Rs 24,180" clipped to "Rs 24,1…" and the headings ran
 * together; it is a dot against the dates now, which is all it ever needed.
 */
const COLS = [275, 220, 155, 185, 115, 130];
const HEADS = ["Dates", "Unit", "Guest", "Source", "Sale", "Payout"];
/** Right-aligned columns, by index. */
const RIGHT = 4;
const PAD = 18;

function tableHeader(c: CanvasRenderingContext2D, t: Theme, y: number) {
  c.fillStyle = t.raised;
  rr(c, M, y, CW, 46, 8);
  c.fill();
  c.fillStyle = t.muted;
  c.font = `500 14px ${t.font}`;
  c.letterSpacing = "1px";
  let cx = M + PAD;
  HEADS.forEach((head, i) => {
    const right = i >= RIGHT;
    c.textAlign = right ? "right" : "left";
    c.fillText(head.toUpperCase(), right ? cx + COLS[i] - PAD * 2 : cx, y + 30);
    cx += COLS[i];
  });
  c.textAlign = "left";
  c.letterSpacing = "0px";
  return y + 46;
}

function tableRow(c: CanvasRenderingContext2D, t: Theme, y: number, row: ReportRow, alt: boolean) {
  const RH = 44;
  if (alt) {
    c.fillStyle = "rgba(255,255,255,0.022)";
    c.fillRect(M, y, CW, RH);
  }
  c.fillStyle = t.line;
  c.fillRect(M, y + RH - 1, CW, 1);

  const ss = rowShortStay(row);
  const names = (row.booking_properties ?? [])
    .map((bp) => bp.properties?.name)
    .filter(Boolean)
    .join(" + ");

  const cells = [
    ss
      ? `${formatDayMonth(row.check_in)} · ${formatShortStayWindow(ss.start, ss.end)}`
      : `${formatDayMonth(row.check_in)} → ${formatDayMonth(
          departureDate(row.check_in, row.check_out, row.is_short_stay)
        )}`,
    names || "—",
    row.guest_name ?? "—",
    sourceLabel(row.source) ?? row.source,
    formatPKR(row.sale_price ?? 0),
    formatPKR(row.client_payout ?? 0),
  ];

  // Status, in the only space it needs: a dot ahead of the dates.
  c.fillStyle = row.status === "tentative" ? t.gold : t.positive;
  c.beginPath();
  c.arc(M + PAD + 4, y + 23, 4, 0, Math.PI * 2);
  c.fill();

  let cx = M + PAD + 18;
  cells.forEach((cell, i) => {
    const right = i >= RIGHT;
    const last = i === COLS.length - 1;
    c.font = `${last ? 500 : 400} 16px ${t.font}`;
    c.fillStyle = last ? t.goldBright : i === 1 ? t.ink : t.dim;
    c.textAlign = right ? "right" : "left";
    // The dot eats into the first column only.
    const max = COLS[i] - PAD * 2 - (i === 0 ? 18 : 0);
    c.fillText(clip(c, cell, max), right ? cx + COLS[i] - PAD * 2 : cx, y + 28);
    cx += COLS[i] - (i === 0 ? 18 : 0);
  });
  c.textAlign = "left";
  return y + RH;
}

export type RenderOptions = {
  /** Leave the units that sold nothing out of the per-unit panel. */
  soldOnly?: boolean;
};

/** Exported so the drawing can be exercised without going through the button. */
export async function renderStatementPages(
  r: StatementReport,
  { soldOnly = true }: RenderOptions = {}
): Promise<PdfPage[]> {
  await document.fonts.ready;
  const t = readTheme();
  const canvases: HTMLCanvasElement[] = [];

  const ROWS_FIRST = 0;
  const PER_PAGE = 28;
  const pageCount = 1 + Math.max(1, Math.ceil(r.rows.length / PER_PAGE));

  // ── Page one: the month at a glance ───────────────────────────────────────
  {
    const { canvas, c } = page(t);
    masthead(c, t, r, false);

    const tw = (CW - 60) / 4;
    const tiles: [string, string, string, string][] = [
      ["Gross revenue", formatPKR(r.totals.gross), `${r.totals.stays} stays`, t.glow],
      ["Your payout", formatPKR(r.totals.payout), "before any settlement", t.gold],
      ["Nights sold", String(r.occupancy.nightsSold), `across ${r.occupancy.units} units`, t.positive],
      [
        "Occupancy",
        `${r.occupancy.pct}%`,
        `of ${r.occupancy.nightsTotal} nights`,
        cssVar("--color-channel-booking") || "#3b82f6",
      ],
    ];
    tiles.forEach((tile4, i) => {
      tile(c, t, M + i * (tw + 20), 348, tw, 140, tile4[0], tile4[1], tile4[2], tile4[3]);
    });

    trend(c, t, r, M, 528, CW, 340);
    const half = (CW - 24) / 2;
    donut(c, t, r, M, 896, half, 330);
    unitBars(c, t, r, M + half + 24, 896, half, 330, soldOnly);

    c.fillStyle = t.muted;
    c.font = `400 16px ${t.font}`;
    c.fillText(
      `${r.rows.length} ${r.rows.length === 1 ? "stay is" : "stays are"} itemised on the ${
        pageCount > 2 ? "pages" : "page"
      } that follow.`,
      M,
      1290
    );

    footer(c, t, r, 1, pageCount);
    canvases.push(canvas);
  }

  // ── The itemised list ─────────────────────────────────────────────────────
  const chunks: ReportRow[][] = [];
  for (let i = 0; i < r.rows.length; i += PER_PAGE) chunks.push(r.rows.slice(i, i + PER_PAGE));
  if (chunks.length === 0) chunks.push([]);

  chunks.forEach((chunk, ci) => {
    const { canvas, c } = page(t);
    const top = masthead(c, t, r, true);

    c.fillStyle = t.ink;
    c.font = `500 26px ${t.font}`;
    const heading = "Every stay this month";
    c.fillText(heading, M, top + 62);

    // The dot needs saying once, or it is decoration. Placed off the measured
    // heading rather than a guessed offset, which had it touching the title.
    let lx = M + c.measureText(heading).width + 34;
    c.font = `400 14px ${t.font}`;
    ([
      [t.positive, "confirmed"],
      [t.gold, "tentative"],
    ] as [string, string][]).forEach(([colour, word]) => {
      c.fillStyle = colour;
      c.beginPath();
      c.arc(lx, top + 56, 4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = t.muted;
      c.fillText(word, lx + 12, top + 61);
      lx += 24 + c.measureText(word).width + 18;
    });

    let y = tableHeader(c, t, top + 92);
    chunk.forEach((row, i) => {
      y = tableRow(c, t, y, row, i % 2 === 1);
    });

    if (chunk.length === 0) {
      c.fillStyle = t.muted;
      c.font = `400 18px ${t.font}`;
      c.fillText("No stays recorded this month.", M + 18, y + 44);
    }

    // The total belongs under the last page's rows, not repeated on each.
    if (ci === chunks.length - 1 && chunk.length > 0) {
      c.fillStyle = t.raised;
      rr(c, M, y + 14, CW, 52, 8);
      c.fill();
      c.fillStyle = t.ink;
      c.font = `500 17px ${t.font}`;
      c.fillText("Total", M + PAD, y + 46);
      let cx = M + PAD;
      for (let i = 0; i < RIGHT; i++) cx += COLS[i];
      c.textAlign = "right";
      c.fillStyle = t.dim;
      c.fillText(formatPKR(r.totals.gross), cx + COLS[RIGHT] - PAD * 2, y + 46);
      c.fillStyle = t.goldBright;
      c.fillText(
        formatPKR(r.totals.payout),
        cx + COLS[RIGHT] + COLS[RIGHT + 1] - PAD * 2,
        y + 46
      );
      c.textAlign = "left";
    }

    footer(c, t, r, ci + 2, pageCount);
    canvases.push(canvas);
  });

  void ROWS_FIRST;
  return Promise.all(
    canvases.map(async (canvas) => ({
      jpeg: await canvasToJpeg(canvas),
      width: canvas.width,
      height: canvas.height,
    }))
  );
}

export function StatementPdf({
  report,
  filename,
  disabled,
}: {
  report: StatementReport;
  filename: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // On by default: the empty bars were the complaint, and a unit that sold
  // nothing is still reported — as a count under the bars, not five rows of it.
  const [soldOnly, setSoldOnly] = useState(true);
  const idle = report.units.filter((u) => u.payout <= 0).length;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const blob = pagesToPdfBlob(await renderStatementPages(report, { soldOnly }));
      const file = new File([blob], filename, { type: "application/pdf" });

      // Same call PayoutReceipt makes: a phone hands it to WhatsApp or the OS
      // share sheet, everything else falls back to a download.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Hostello statement" });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // a cancelled share
      setError("Could not build the PDF. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={save}
        disabled={disabled || busy}
        title={disabled ? "Nothing to report for this month" : undefined}
        className="btn btn-ghost btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <FileText size={13} />
        {busy ? "Building…" : "Statement PDF"}
      </button>

      {/* Offered only when it would change the document. With every unit
          earning, the toggle is a control that does nothing.

          16px box, and the label's padding carries the hit area, so the whole
          control is the target. The box alone was 12px before, which is under
          the 24px WCAG asks for on touch. */}
      {!disabled && idle > 0 && (
        <label className="flex items-center gap-2 text-[11px] text-ink-muted cursor-pointer select-none py-1.5 px-1 -my-1.5">
          <input
            type="checkbox"
            checked={soldOnly}
            onChange={(e) => setSoldOnly(e.target.checked)}
            className="accent-hostello-gold w-4 h-4 cursor-pointer"
          />
          Only units that sold
        </label>
      )}

      {error && <span className="text-[11px] text-negative">{error}</span>}
    </span>
  );
}
