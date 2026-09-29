"use client";

import { useMemo, useState, type ReactNode } from "react";
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
  mode = "nights",
}: {
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
  busy: BusyRange[];
  /** "day" picks a single date — a short stay, which is stored as one night. */
  mode?: "nights" | "day";
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

  // A short stay is one date, so there is never a second half to pick.
  const picking: "in" | "out" = mode === "day" ? "in" : checkIn && !checkOut ? "out" : "in";

  function cellState(date: string): CellState {
    if (takenNights.has(date)) return "taken";
    if (date === checkIn) return "start";
    // In day mode the check-out is the next morning, not a night on the sheet.
    if (mode !== "day" && checkOut && date === checkOut) return "end";
    if (checkIn && checkOut && date > checkIn && date < checkOut) return "mid";
    if (picking === "out" && date > checkIn && (!nextTaken || date <= nextTaken)) {
      return "reachable";
    }
    if (picking === "out") return "unreachable";
    return "free";
  }

  function pick(date: string) {
    if (takenNights.has(date)) return;

    // One tap is the whole answer for a short stay: the day, plus the check-out
    // morning it is stored with.
    if (mode === "day") {
      onChange(date, addDaysISO(date, 1));
      return;
    }

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
    <div className="flex flex-col gap-3">
      <input type="hidden" name="check_in" value={checkIn} />
      <input type="hidden" name="check_out" value={checkOut} />

      <div className="relative overflow-clip rounded-2xl border border-border-hairline bg-surface-2/70 p-3 sm:p-4 flex flex-col gap-3">
        <span className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full bg-hostello-purple-glow/15 blur-3xl" aria-hidden />

        <div className="relative flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView(addMonths(view.year, view.month0, -1))}
            aria-label="Previous month"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-border-hairline text-ink-muted hover:text-ink-primary hover:border-hostello-purple-mid hover:bg-hostello-purple-glow/15 transition-colors"
          >
            <ChevronLeft size={15} />
          </button>
          <p key={`${view.year}-${view.month0}`} className="animate-fade text-sm font-semibold text-ink-primary">
            {formatMonthLabel(view.year, view.month0)}
          </p>
          <button
            type="button"
            onClick={() => setView(addMonths(view.year, view.month0, 1))}
            aria-label="Next month"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-border-hairline text-ink-muted hover:text-ink-primary hover:border-hostello-purple-mid hover:bg-hostello-purple-glow/15 transition-colors"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {/* No column gap, so a picked range reads as one gold ribbon across the week. */}
        <div key={`grid-${view.year}-${view.month0}`} className="animate-fade relative grid grid-cols-7 gap-y-1">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="text-center text-[10px] font-semibold uppercase tracking-wider text-ink-muted pb-1">
              {w}
            </div>
          ))}

          {grid.map((cell, i) => {
            if (!cell.date) return <div key={`pad-${i}`} />;
            const date = cell.date;
            const state = cellState(date);
            const day = Number(date.slice(8, 10));
            const disabled = state === "taken" || state === "unreachable";
            const blockNight = state === "taken" && takenNights.get(date) === "block";

            return (
              <button
                key={date}
                type="button"
                disabled={disabled}
                onClick={() => pick(date)}
                title={
                  state === "taken"
                    ? `${blockNight ? "Blocked" : "Booked"} — ${formatDayMonth(date)}`
                    : formatDayMonth(date)
                }
                className={`relative h-10 text-xs tabular-nums transition-all duration-150 ${cellClass(state)}`}
              >
                {day}
                {state === "taken" &&
                  (blockNight ? (
                    <Lock size={8} aria-hidden className="absolute top-1 right-1 opacity-70" />
                  ) : (
                    <span aria-hidden className="absolute inset-x-2.5 top-1/2 h-px bg-current opacity-60" />
                  ))}
                {date === today && (
                  <span
                    aria-hidden
                    className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${
                      state === "start" || state === "end" ? "bg-surface-0" : "bg-hostello-gold"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="relative flex items-center gap-3 flex-wrap text-[10px] text-ink-muted pt-2 border-t border-border-hairline">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-status-booked/60" /> Booked
          </span>
          <span className="flex items-center gap-1.5">
            <Lock size={9} /> Blocked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full gradient-gold" /> Your stay
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-hostello-gold" /> Today
          </span>
        </div>
      </div>

      <p className="text-xs text-ink-secondary flex items-center gap-1.5 flex-wrap">
        {mode === "day" ? (
          checkIn ? (
            <>
              Short stay on <DatePill>{formatDayMonth(checkIn)}</DatePill>
            </>
          ) : (
            "Pick the day of the short stay."
          )
        ) : !checkIn ? (
          "Pick the check-in night."
        ) : !checkOut ? (
          <>
            Check-in <DatePill>{formatDayMonth(checkIn)}</DatePill> Now pick the check-out morning
            {nextTaken ? ` — free up to ${formatDayMonth(nextTaken)}.` : "."}
          </>
        ) : (
          <>
            <DatePill>{formatDayMonth(checkIn)}</DatePill>
            <span aria-hidden>→</span>
            <DatePill>{formatDayMonth(checkOut)}</DatePill>
            <span className="text-ink-primary font-semibold">
              {nights} night{nights === 1 ? "" : "s"}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function DatePill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-hostello-gold/40 bg-hostello-gold/10 px-2.5 py-0.5 text-ink-primary font-medium">
      {children}
    </span>
  );
}

function cellClass(state: CellState) {
  switch (state) {
    case "taken":
      return "rounded-xl text-status-booked/80 bg-status-booked/10 cursor-not-allowed";
    case "start":
    case "end":
      return "z-10 rounded-xl gradient-gold text-surface-0 font-bold scale-105 shadow-[0_8px_22px_-8px_rgba(245,201,104,0.9)]";
    case "mid":
      return "bg-hostello-gold/20 text-ink-primary font-medium";
    case "reachable":
      return "rounded-xl text-ink-primary hover:bg-hostello-gold/25 hover:scale-105";
    case "unreachable":
      return "rounded-xl text-ink-muted/35 cursor-not-allowed";
    default:
      return "rounded-xl text-ink-secondary hover:bg-hostello-purple-glow/20 hover:text-ink-primary hover:scale-105";
  }
}
