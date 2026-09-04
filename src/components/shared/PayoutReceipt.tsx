"use client";

import { useState } from "react";
import { Check, Clock, Download, Share2, X } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import { methodLabel, type PayoutStatus } from "@/lib/owed";

/**
 * The receipt for one payment, and the only screen in the flow that a person is
 * likely to keep.
 *
 * It is deliberately not a "payment sent" screen. A payment here settles
 * nothing until the side receiving it says the money arrived, so the tracker is
 * part of the receipt rather than a detail below it: *Sent* is filled in the
 * moment it is filed, *Confirmed* only when the other side says so. The same
 * page is what both sides revisit later, and it re-renders from the row — so
 * the receipt someone screenshotted an hour ago and the one on screen now tell
 * the same story.
 *
 * Timestamps are absolute and pinned to Asia/Karachi: a relative "3m ago"
 * rendered on the server and again in the browser is a hydration mismatch, and
 * a receipt is the wrong place for a number that drifts.
 */
function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  });
}

export type ReceiptProps = {
  id: string;
  status: PayoutStatus;
  /** Recorded received by Hostello for an owner who has no login to confirm it. */
  confirmedOffline: boolean;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  /** "Hostello" or the owner's name — whoever the money went to. */
  payee: string;
  payer: string;
  /** Who the tracker is waiting on, in words. */
  awaiting: string;
  /** What the confirmed payment cleared. Empty until it is confirmed. */
  cleared: { bookingId: string; amount: number; guestName: string | null }[];
};

export function PayoutReceipt(props: ReceiptProps) {
  const [busy, setBusy] = useState(false);
  const settled = props.status === "received";
  const rejected = props.status === "rejected";

  async function saveImage() {
    setBusy(true);
    try {
      const blob = await drawReceipt(props);
      if (!blob) return;
      const file = new File([blob], `hostello-receipt-${props.id.slice(0, 8)}.png`, {
        type: "image/png",
      });

      // Wherever the browser can share files — phones, and desktop Chrome on
      // Windows — this hands the receipt to WhatsApp or the OS share sheet.
      // Everywhere else it falls back to a download.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Hostello payment receipt" });
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // A cancelled share rejects; that is not an error worth a banner.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card overflow-hidden">
        <div className="px-5 pt-7 pb-6 text-center border-b border-border-hairline">
          <span
            className={`inline-flex items-center justify-center w-14 h-14 rounded-full mb-4 ${
              rejected
                ? "bg-status-booked/15 text-status-booked"
                : settled
                  ? "bg-hostello-gold/15 text-hostello-gold animate-receipt-pop"
                  : "bg-status-pending/20 text-status-pending animate-receipt-pop"
            }`}
          >
            {rejected ? <X size={26} /> : settled ? <Check size={26} /> : <Clock size={26} />}
          </span>

          <p className="text-[2.25rem] leading-none font-semibold text-financial tabular-nums">
            {formatPKR(props.amount)}
          </p>
          <p className="text-sm text-ink-secondary mt-2.5">
            {rejected ? "Not received by" : settled ? "Received by" : "Sent to"} {props.payee}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">{stamp(props.createdAt)}</p>
        </div>

        <Tracker {...props} />

        <dl className="text-xs px-5 divide-y divide-border-hairline">
          <Row label="From" value={props.payer} />
          <Row label="To" value={props.payee} />
          <Row label="Method" value={methodLabel(props.method)} />
          {props.reference && <Row label="Reference" value={props.reference} />}
          <Row label="Receipt no." value={props.id.slice(0, 8).toUpperCase()} />
        </dl>

        {props.cleared.length > 0 && (
          <div className="px-5 py-4 border-t border-border-hairline">
            <p className="text-[11px] text-ink-muted mb-2">
              Cleared {props.cleared.length} {props.cleared.length === 1 ? "booking" : "bookings"}
            </p>
            <ul className="flex flex-col gap-1.5">
              {props.cleared.map((c) => (
                <li key={c.bookingId} className="flex justify-between gap-3 text-xs">
                  <span className="text-ink-secondary truncate">{c.guestName ?? "Guest"}</span>
                  <span className="text-financial tabular-nums shrink-0">
                    {formatPKR(c.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {rejected && (
          <p className="px-5 py-4 text-xs text-status-booked border-t border-border-hairline">
            {props.note
              ? `${props.payee} says: ${props.note}`
              : `${props.payee} could not find this payment.`}{" "}
            <span className="text-ink-muted">The amount owed is unchanged.</span>
          </p>
        )}

        {props.confirmedOffline && (
          <p className="px-5 py-4 text-xs text-status-pending border-t border-border-hairline">
            Marked received by Hostello — this owner has no portal login to confirm it themselves.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={saveImage}
        disabled={busy}
        className="btn btn-ghost btn-sm self-center disabled:opacity-60"
      >
        {busy ? <Download size={14} /> : <Share2 size={14} />}
        {busy ? "Preparing…" : "Save or share this receipt"}
      </button>
    </div>
  );
}

/** Sent → Confirmed. Never one step: the second is someone else's to take. */
function Tracker({
  status,
  createdAt,
  reviewedAt,
  awaiting,
}: Pick<ReceiptProps, "status" | "createdAt" | "reviewedAt" | "awaiting">) {
  const done = status === "received";
  const failed = status === "rejected";

  return (
    <ol className="px-5 py-4 flex flex-col gap-3 border-b border-border-hairline">
      <Step filled label="Sent" caption={stamp(createdAt)} />
      <Step
        filled={done || failed}
        failed={failed}
        label={failed ? "Not received" : "Confirmed"}
        caption={
          reviewedAt
            ? stamp(reviewedAt)
            : `Nothing is settled until ${awaiting} confirms this arrived`
        }
      />
    </ol>
  );
}

function Step({
  filled,
  failed,
  label,
  caption,
}: {
  filled: boolean;
  failed?: boolean;
  label: string;
  caption: string;
}) {
  return (
    <li className="flex gap-3 items-start">
      <span
        className={`mt-0.5 shrink-0 w-4 h-4 rounded-full border flex items-center justify-center ${
          failed
            ? "border-status-booked bg-status-booked/20 text-status-booked"
            : filled
              ? "border-hostello-gold bg-hostello-gold/20 text-hostello-gold"
              : "border-border-strong"
        }`}
      >
        {filled && (failed ? <X size={9} /> : <Check size={9} />)}
      </span>
      <span className="min-w-0">
        <span
          className={`block text-xs ${filled ? "text-ink-primary" : "text-ink-secondary"}`}
        >
          {label}
        </span>
        <span className="block text-[11px] text-ink-muted mt-0.5">{caption}</span>
      </span>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-ink-muted shrink-0">{label}</dt>
      <dd className="text-ink-primary text-right break-words min-w-0">{value}</dd>
    </div>
  );
}

/**
 * The receipt as a PNG, drawn rather than screenshotted.
 *
 * Canvas because the alternative is a DOM-to-image dependency for what is a
 * dozen `fillText` calls, and because a drawn receipt states its own status
 * instead of capturing whatever the page happened to be showing.
 */
async function drawReceipt(props: ReceiptProps): Promise<Blob | null> {
  const scale = 2;
  const W = 420;
  const rows: [string, string][] = [
    ["From", props.payer],
    ["To", props.payee],
    ["Method", methodLabel(props.method)],
    ...(props.reference ? ([["Reference", props.reference]] as [string, string][]) : []),
    ["Receipt no.", props.id.slice(0, 8).toUpperCase()],
    [
      "Status",
      props.status === "received"
        ? `Confirmed ${props.reviewedAt ? stamp(props.reviewedAt) : ""}`.trim()
        : props.status === "rejected"
          ? "Not received"
          : "Pending confirmation",
    ],
  ];
  const H = 216 + rows.length * 34 + 52;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);

  const gold = "#c9a44c";
  const ink = "#f4f1fa";
  const muted = "#8b849c";

  ctx.fillStyle = "#15121f";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1e1a2c";
  ctx.fillRect(0, 0, W, 176);
  ctx.fillStyle = "rgba(201, 164, 76, 0.35)";
  ctx.fillRect(0, 0, W, 3);

  const centre = W / 2;
  ctx.textAlign = "center";

  ctx.fillStyle = muted;
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillText("HOSTELLO · PAYMENT RECEIPT", centre, 40);

  ctx.fillStyle = gold;
  ctx.font = "600 38px system-ui, sans-serif";
  ctx.fillText(formatPKR(props.amount), centre, 92);

  ctx.fillStyle = ink;
  ctx.font = "14px system-ui, sans-serif";
  const verb =
    props.status === "rejected" ? "Not received by" : props.status === "received" ? "Received by" : "Sent to";
  ctx.fillText(`${verb} ${props.payee}`, centre, 120);

  ctx.fillStyle = muted;
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(stamp(props.createdAt), centre, 142);

  // The status is the point of the receipt, so it gets its own band.
  const bandTone =
    props.status === "received"
      ? gold
      : props.status === "rejected"
        ? "#c1554f"
        : "#c79a3d";
  ctx.fillStyle = bandTone;
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.fillText(
    truncate(
      ctx,
      props.status === "received"
      ? props.confirmedOffline
        ? "RECORDED RECEIVED BY HOSTELLO"
        : "CONFIRMED RECEIVED"
      : props.status === "rejected"
        ? "REPORTED NOT RECEIVED"
        : `AWAITING CONFIRMATION FROM ${props.payee.toUpperCase()}`,
      W - 48
    ),
    centre,
    165
  );

  ctx.textAlign = "left";
  let y = 216;
  for (const [label, value] of rows) {
    ctx.fillStyle = muted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(label, 28, y);

    ctx.fillStyle = ink;
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(truncate(ctx, value, 240), W - 28, y);
    ctx.textAlign = "left";

    ctx.fillStyle = "rgba(190, 178, 226, 0.11)";
    ctx.fillRect(28, y + 12, W - 56, 1);
    y += 34;
  }

  ctx.fillStyle = muted;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "center";
  const footer =
    props.status === "received"
      ? "This payment has been confirmed and allocated to the bookings it cleared."
      : "A recorded payment settles nothing until the receiving side confirms it.";
  wrap(ctx, footer, centre, H - 46, W - 72, 14);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function truncate(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  max: number,
  lineHeight: number
) {
  let line = "";
  let cursor = y;
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x, cursor);
}
