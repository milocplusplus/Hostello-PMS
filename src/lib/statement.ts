import { addDaysISO } from "./calendar";
import { nightsBetween } from "./payout";
import { departureDate, formatShortStayWindow, rowShortStay } from "./short-stay";
import { sourceLabel } from "./block-sources";
import type { MonthProfit } from "./profit";

/**
 * The owner's monthly statement, as a spreadsheet.
 *
 * One row per confirmed stay touching the month — the confirmed part of what
 * the Bookings & Payouts page lists — with nights counted inside the month
 * (`nightsInMonth`), the same figure the page shows.
 * Nothing is re-derived here: `sale_price` and `client_payout` were decided by
 * `payout.ts` when the booking was written and snapshotted onto the row.
 *
 * **Hostello's share is deliberately not a column.** The client portal shows an
 * owner their own payout and never the other side of the split — the calendar,
 * the day sheet and the check-in board all say so in as many words — and a file
 * they forward to an accountant is not the place to break that.
 *
 * Figures are written as bare numbers, not `formatPKR`. A statement exists to
 * be summed, and "Rs 14,000" is text to a spreadsheet.
 */

export type StatementRow = {
  guest_name: string | null;
  check_in: string;
  check_out: string;
  is_short_stay: boolean;
  short_stay_start: string | null;
  short_stay_end: string | null;
  source: string;
  status: string;
  sale_price: number | null;
  client_payout: number | null;
  /** What Hostello has to send for this stay; zero when the owner took the money. */
  due_to_client: number | null;
  settled: boolean;
  settled_date: string | null;
  booking_properties: unknown;
};

const COLUMNS = [
  "Check-in",
  "Check-out",
  "Nights this month",
  "Type",
  "Units",
  "Guest",
  "Source",
  "Status",
  "Sale price (PKR)",
  "Your payout (PKR)",
  "Settled",
  "Settled on",
] as const;

/** RFC 4180: quote anything holding a comma, a quote or a newline. */
function cell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Joined with " + ", not the ", " the screens use. A unit name may itself hold
 * a comma ("Cedar Lodge, Upper"), and in a comma-delimited file that makes a
 * two-unit cell unreadable even though the quoting is correct.
 */
function unitNames(row: { booking_properties: unknown }): string {
  return ((row.booking_properties as { properties: { name: string } | null }[] | null) ?? [])
    .map((bp) => bp.properties?.name)
    .filter(Boolean)
    .join(" + ");
}

export type StatementMonth = { start: string; end: string };

/**
 * A stay's nights inside the month, so a stay across its start or end counts
 * only its own part. check_out is exclusive, and so is the day after the
 * month's last. A short stay is no night, as it is everywhere on the statement.
 */
export function nightsInMonth(
  row: Pick<StatementRow, "check_in" | "check_out" | "is_short_stay" | "short_stay_start" | "short_stay_end">,
  month: StatementMonth
): number {
  if (rowShortStay(row)) return 0;
  const after = addDaysISO(month.end, 1);
  return nightsBetween(
    row.check_in > month.start ? row.check_in : month.start,
    row.check_out < after ? row.check_out : after
  );
}

function line(row: StatementRow, month: StatementMonth): (string | number | null)[] {
  const shortStay = rowShortStay(row);
  return [
    row.check_in,
    // A short stay is stored as one night so every night-based query keeps
    // working; it actually leaves the day it arrives. `departureDate` is the
    // one place that knows it, so the file says the day they really left.
    departureDate(row.check_in, row.check_out, row.is_short_stay),
    nightsInMonth(row, month),
    shortStay ? `Short stay ${formatShortStayWindow(shortStay.start, shortStay.end)}` : "Night stay",
    unitNames(row),
    row.guest_name ?? "",
    sourceLabel(row.source) ?? row.source,
    // The enum reads as a database value otherwise, and this is a document
    // somebody forwards to an accountant.
    row.status.charAt(0).toUpperCase() + row.status.slice(1),
    Number(row.sale_price ?? 0),
    Number(row.client_payout ?? 0),
    // Nothing to settle when the guest's money went to the owner in the first place.
    row.settled ? "Yes" : Number(row.due_to_client ?? 0) > 0 ? "No" : "Paid to you directly",
    row.settled_date ?? "",
  ];
}

export type StatementTotals = { gross: number; payout: number; nights: number; stays: number };

export function statementTotals(rows: StatementRow[], month: StatementMonth): StatementTotals {
  return rows.reduce(
    (acc, r) => {
      acc.gross += Number(r.sale_price ?? 0);
      acc.payout += Number(r.client_payout ?? 0);
      acc.nights += nightsInMonth(r, month);
      acc.stays += 1;
      return acc;
    },
    { gross: 0, payout: 0, nights: 0, stays: 0 }
  );
}

/**
 * The owner's own expenses for the month and what that leaves — only when they
 * keep expenses here and this month is inside their records (`profit.recorded`).
 * Income here follows `loadProfit`'s rule (confirmed, by check-in month), not
 * the stays table's, and the file says so rather than let the two figures be
 * read as one.
 */
function expenseSection(profit: MonthProfit): (string | number | null)[][] {
  return [
    [],
    ["Your expenses"],
    ["Bill date", "Category", "Unit", "Paid to", "Status", "Amount (PKR)"],
    ...profit.items.map((e) => [
      e.date,
      e.category,
      e.unit ?? "All units",
      e.vendor ?? "",
      e.paid ? "Paid" : "Unpaid",
      e.amount,
    ]),
    ["Total", "", "", "", "", profit.expenses],
    [],
    ["Profit"],
    ["Your payout — confirmed stays checking in this month", profit.income],
    ["Your expenses", profit.expenses],
    ["Profit", profit.profit],
    [
      "Payout here counts confirmed stays in the month they check in, so it can differ from the stays total above.",
    ],
  ];
}

export function buildStatementCsv(
  rows: StatementRow[],
  meta: { clientName: string; monthLabel: string; month: StatementMonth; profit?: MonthProfit | null }
): string {
  const totals = statementTotals(rows, meta.month);

  const body = [
    [`Hostello statement — ${meta.clientName}`],
    [meta.monthLabel],
    [],
    COLUMNS as unknown as string[],
    ...rows.map((r) => line(r, meta.month)),
    [],
    // Sits under the two money columns it adds up, so a reader can see at a
    // glance that the rows above come to this.
    ["Total", "", totals.nights, "", "", "", "", "", totals.gross, totals.payout, "", ""],
    ...(meta.profit?.recorded ? expenseSection(meta.profit) : []),
  ];

  // A UTF-8 BOM, because Excel reads a CSV without one as the system codepage
  // and turns any non-Latin guest name into mojibake.
  return "﻿" + body.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** `hostello-statement-murree-spring-apartments-2026-09.csv` */
export function statementFilename(clientName: string, monthParam: string): string {
  const slug =
    clientName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "client";
  return `hostello-statement-${slug}-${monthParam}.csv`;
}
