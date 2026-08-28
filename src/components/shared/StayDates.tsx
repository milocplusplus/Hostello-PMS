"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { nightsBetween } from "@/lib/payout";
import {
  addDaysISO,
  addMonths,
  formatDayMonth,
  formatMonthLabel,
  getMonthGrid,
  parseMonthParam,
  todayISO,
} from "@/lib/calendar";

/** Occupied nights on the units currently selected, start..end inclusive. */
export type BusyRange = { start: string; end: string; kind: "booking" | "block" };

type CellState = "taken" | "start" | "end" | "mid" | "reachable" | "unreachable" | "free";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Check-in / check-out picker that shows what is already taken.
 *
 * A native `<input type="date">` cannot grey out a booked night, so blocked and
 * booked dates were invisible until the server rejected the save. This is a
 * month grid instead: taken nights are struck through and unclickable, and once
 * a check-in is picked you can't reach past the next taken night, so a clashing
 * range can't be composed in the first place.
 *
 * `check_in` / `check_out` are submitted as hidden inputs, so the server
 * contract is unchanged — `check_out` is still the exclusive departure morning.
 */
export function StayDates({
  checkIn,
  checkOut,
  onChange,
  busy,
}: {
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
  busy: BusyRange[];
}) {
  const today = todayISO();
  const [view, setView] = useState(() => parseMonthParam((checkIn || today).slice(0, 7)));

  // Ranges are short and few, so a flat set of nights is cheaper to reason
  // about than interval arithmetic on every cell.
  const takenNights = useMemo(() => {
    const map = new Map<string, "booking" | "block">();
    for (const range of busy) {
      for (let d = range.start; d <= range.end; d = addDaysISO(d, 1)) {
        // A booking wins the cell: "someone is staying" is the more useful
        // thing to say when a block sits under it.
        if (range.kind === "booking" || !map.has(d)) map.set(d, range.kind);
      }
    }
    return map;
  }, [busy]);

  // Once check-in is set, the stay can run only as far as the next taken night:
  // checking out ON that date is fine (the nights before it are all free),
  // going past it is not.
  const nextTaken = useMemo(() => {
    if (!checkIn) return null;
    const starts = busy.map((r) => r.start).filter((s) => s > checkIn).sort();
    return starts[0] ?? null;
  }, [busy, checkIn]);

  const picking: "in" | "out" = checkIn && !checkOut ? "out" : "in";

  function cellState(date: string): CellState {
    if (takenNights.has(date)) return "taken";
    if (date === checkIn) return "start";
    if (checkOut && date === checkOut) return "end";
    if (checkIn && checkOut && date > checkIn && date < checkOut) return "mid";
    if (picking === "out" && date > checkIn && (!nextTaken || date <= nextTaken)) {
      return "reachable";
    }
    if (picking === "out") return "unreachable";
    return "free";
  }

  function pick(date: string) {
    if (takenNights.has(date)) return;

    // Anything at or before the current check-in restarts the selection, which
    // is also how you correct a mis-click without a Clear button.
    if (picking === "in" || date <= checkIn) {
      onChange(date, "");
      setView(parseMonthParam(date.slice(0, 7)));
      return;
    }
    if (nextTaken && date > nextTaken) return;
    onChange(checkIn, date);
  }

  const grid = getMonthGrid(view.year, view.month0);
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="check_in" value={checkIn} />
      <input type="hidden" name="check_out" value={checkOut} />

      <div className="rounded-md border border-border-hairline bg-surface-2 p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView(addMonths(view.year, view.month0, -1))}
            aria-label="Previous month"
            className="p-1 rounded text-ink-muted hover:text-ink-primary hover:bg-surface-3 transition-colors"
          >
            <ChevronLeft size={15} />
          </button>
          <p className="text-xs text-ink-primary">{formatMonthLabel(view.year, view.month0)}</p>
          <button
            type="button"
            onClick={() => setView(addMonths(view.year, view.month0, 1))}
            aria-label="Next month"
            className="p-1 rounded text-ink-muted hover:text-ink-primary hover:bg-surface-3 transition-colors"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="text-center text-[9px] uppercase tracking-wide text-ink-muted py-1">
              {w}
            </div>
          ))}

          {grid.map((cell, i) => {
            if (!cell.date) return <div key={`pad-${i}`} />;
            const date = cell.date;
            const state = cellState(date);
            const day = Number(date.slice(8, 10));
            const disabled = state === "taken" || state === "unreachable";

            return (
              <button
                key={date}
                type="button"
                disabled={disabled}
                onClick={() => pick(date)}
                title={
                  state === "taken"
                    ? `${takenNights.get(date) === "booking" ? "Booked" : "Blocked"} — ${formatDayMonth(date)}`
                    : formatDayMonth(date)
                }
                className={`relative h-8 text-xs rounded transition-colors ${cellClass(state)} ${
                  date === today ? "ring-1 ring-inset ring-hostello-gold/60" : ""
                }`}
              >
                {day}
                {state === "taken" && (
                  <span
                    aria-hidden
                    className="absolute inset-x-1.5 top-1/2 h-px bg-current opacity-60"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 flex-wrap text-[10px] text-ink-muted pt-1 border-t border-border-hairline">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-status-booked/50" /> Booked
          </span>
          <span className="flex items-center gap-1">
            <Lock size={9} /> Blocked
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-hostello-gold" /> Your stay
          </span>
        </div>
      </div>

      <p className="text-xs text-ink-secondary">
        {!checkIn ? (
          "Pick the check-in night."
        ) : !checkOut ? (
          <>
            Check-in {formatDayMonth(checkIn)}. Now pick the check-out morning
            {nextTaken ? ` — free up to ${formatDayMonth(nextTaken)}.` : "."}
          </>
        ) : (
          <>
            {formatDayMonth(checkIn)} → {formatDayMonth(checkOut)} ·{" "}
            <span className="text-ink-primary">
              {nights} night{nights === 1 ? "" : "s"}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function cellClass(state: CellState) {
  switch (state) {
    case "taken":
      return "text-status-booked/70 bg-status-booked/10 cursor-not-allowed";
    case "start":
    case "end":
      return "bg-hostello-gold text-surface-0 font-medium";
    case "mid":
      return "bg-hostello-gold/25 text-ink-primary";
    case "reachable":
      return "text-ink-secondary hover:bg-hostello-gold/20";
    case "unreachable":
      return "text-ink-muted/40 cursor-not-allowed";
    default:
      return "text-ink-secondary hover:bg-surface-3";
  }
}
