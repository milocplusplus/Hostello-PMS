import Link from "next/link";
import { CalendarDays, Clock, Lock, LogIn, LogOut } from "lucide-react";
import { sourceInitial } from "@/lib/block-sources";
import type { CalendarRow, CalendarSegment } from "@/components/admin/CalendarBoard";
import { weekdayShort, daysBetweenISO } from "@/lib/calendar";

type Entry = { seg: CalendarSegment; property: string };

/**
 * The same data the timeline draws, read as a day sheet: who leaves, who
 * arrives, how much is occupied. Scrolls vertically, so it is the view that
 * actually works on a phone.
 */
export function CalendarAgenda({
  days,
  today,
  rows,
}: {
  days: string[];
  today: string;
  rows: CalendarRow[];
}) {
  const arrivals: Entry[][] = days.map(() => []);
  const departures: Entry[][] = days.map(() => []);
  const occupied = days.map(() => 0);

  for (const row of rows) {
    for (const seg of row.segments) {
      const entry = { seg, property: row.name };
      if (!seg.clippedStart) arrivals[seg.startIdx].push(entry);
      // check_out is the morning after the last night; blocks just end.
      const outIdx = seg.startIdx + seg.span;
      // A short stay leaves the day it arrives, and its "in" row already
      // carries the hours it ends at — a departure the next morning is fiction.
      if (seg.kind === "booking" && !seg.hours && !seg.clippedEnd && outIdx < days.length) {
        departures[outIdx].push(entry);
      }
    }
    for (let i = 0; i < days.length; i++) if (row.covered[i]) occupied[i]++;
  }

  const shown = days
    .map((_, i) => i)
    .filter((i) => arrivals[i].length > 0 || departures[i].length > 0 || days[i] === today);

  if (shown.length === 0) {
    return (
      <div className="card p-8 md:p-10 flex flex-col items-center gap-3 text-center">
        <span className="w-12 h-12 rounded-2xl gradient-brand-subtle flex items-center justify-center text-hostello-purple-light">
          <CalendarDays size={22} />
        </span>
        <p className="text-sm text-ink-secondary">Nothing scheduled this month.</p>
      </div>
    );
  }

  // The window starts on the 1st, so by the 26th today is a long way down the
  // sheet. Days already gone fold into a disclosure, which puts today at the top
  // without losing what happened earlier in the month.
  // Only when the window holds today — a month already gone is all "past", and
  // folding the whole sheet away would be absurd.
  const split = days.includes(today);
  const past = split ? shown.filter((i) => days[i] < today) : [];
  const current = split ? shown.filter((i) => days[i] >= today) : shown;

  function dayRow(i: number) {
    const date = days[i];
    const isToday = date === today;
    return (
      <div key={date} className="flex gap-3">
        <div
          className={`w-14 h-[4.25rem] shrink-0 rounded-2xl flex flex-col items-center justify-center ${
            isToday
              ? "gradient-gold text-surface-0 shadow-[0_8px_22px_-8px_var(--color-hostello-gold-bright)]"
              : "card"
          }`}
        >
          <p className={`text-[10px] font-bold uppercase ${isToday ? "" : "text-ink-muted"}`}>
            {weekdayShort(date)}
          </p>
          <p className="num text-xl font-extrabold leading-tight">{Number(date.slice(8, 10))}</p>
          <p className={`text-[10px] font-semibold ${isToday ? "" : "text-ink-muted"}`}>
            {new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
              month: "short",
              timeZone: "UTC",
            })}
          </p>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-2 py-0.5">
          {departures[i].map((e) => (
            <AgendaEntry key={`out-${e.seg.key}`} entry={e} direction="out" />
          ))}
          {arrivals[i].map((e) => (
            <AgendaEntry key={`in-${e.seg.key}`} entry={e} direction="in" />
          ))}
          {/* One dot per unit, lit when it is taken that night */}
          <div
            className="flex items-center gap-1.5 flex-wrap"
            title={`${occupied[i]} of ${rows.length} occupied`}
          >
            {rows.map((r, n) => (
              <span
                key={r.id}
                className={`w-2 h-2 rounded-full ${
                  n < occupied[i]
                    ? "bg-hostello-purple-glow shadow-[0_0_8px_var(--color-hostello-purple-glow)]"
                    : "bg-white/10"
                }`}
              />
            ))}
            <span className="num text-[11px] font-bold text-ink-muted ml-1">
              {occupied[i]}/{rows.length}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 stagger">
      {past.length > 0 && (
        <details className="card px-4 py-3">
          <summary className="text-xs font-bold text-ink-muted cursor-pointer hover:text-ink-secondary transition-colors">
            Earlier this month · {past.length}
          </summary>
          <div className="flex flex-col gap-4 mt-3">{past.map(dayRow)}</div>
        </details>
      )}
      {current.map(dayRow)}
    </div>
  );
}

function AgendaEntry({ entry, direction }: { entry: Entry; direction: "in" | "out" }) {
  const { seg, property } = entry;
  const nights = daysBetweenISO(seg.startDate, seg.endDate) + 1;
  const Icon = direction === "in" ? LogIn : LogOut;

  return (
    <Link
      href={seg.href}
      className={`flex items-center gap-3 rounded-2xl border p-2.5 min-w-0 active:scale-[0.98] transition-transform ${
        seg.tentative ? "border-dashed" : ""
      }`}
      style={{
        backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${seg.color} 34%, transparent), color-mix(in srgb, ${seg.color} 8%, transparent))`,
        borderColor: `color-mix(in srgb, ${seg.color} 45%, transparent)`,
      }}
    >
      <span
        className="relative w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white"
        style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${seg.color} 70%, #000), ${seg.color})` }}
        aria-label={direction === "in" ? "Arriving" : "Leaving"}
      >
        <Icon size={17} strokeWidth={2.4} />
        <span className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full bg-surface-1 border border-white/10 text-[9px] font-extrabold flex items-center justify-center">
          {seg.kind === "booking" ? sourceInitial(seg.source) : <Lock size={9} />}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink-primary truncate">{seg.title}</span>
        <span className="block text-xs text-ink-secondary truncate">
          {property} ·{" "}
          {seg.hours ? (
            <>
              <Clock size={10} className="inline -mt-0.5" /> {seg.hours}
            </>
          ) : (
            `${nights}N`
          )}
        </span>
      </span>
      {seg.amount && (
        <span className="num text-xs font-extrabold text-hostello-gold-bright whitespace-nowrap shrink-0">
          {seg.amount}
        </span>
      )}
    </Link>
  );
}
