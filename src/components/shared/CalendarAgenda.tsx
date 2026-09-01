import Link from "next/link";
import { Lock } from "lucide-react";
import { ChannelBadge } from "@/components/admin/BookingActivity";
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
      <div className="card p-8 md:p-10 text-center text-sm text-ink-secondary">
        Nothing scheduled this month. Switch to Month to book a night.
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
      <div
        key={date}
        className={`flex gap-3 p-3 md:p-4 transition-colors ${
          isToday ? "bg-hostello-gold/[0.06]" : "hover:bg-surface-2/40"
        }`}
      >
        <div
          className={`w-12 shrink-0 text-center rounded-xl py-1.5 ${
            isToday ? "bg-hostello-gold/10 border border-hostello-gold/30" : ""
          }`}
        >
          <p className="text-[10px] uppercase tracking-wide text-ink-muted">{weekdayShort(date)}</p>
          <p
            className={`display num text-lg leading-tight ${
              isToday ? "font-semibold text-hostello-gold" : "text-ink-primary"
            }`}
          >
            {Number(date.slice(8, 10))}
          </p>
          <p className="text-[10px] text-ink-muted">
            {new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
              month: "short",
              timeZone: "UTC",
            })}
          </p>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {departures[i].map((e) => (
            <AgendaEntry key={`out-${e.seg.key}`} entry={e} direction="out" />
          ))}
          {arrivals[i].map((e) => (
            <AgendaEntry key={`in-${e.seg.key}`} entry={e} direction="in" />
          ))}
          <p className="text-[10px] text-ink-muted">
            {occupied[i]} of {rows.length} {rows.length === 1 ? "unit" : "units"} occupied
            {isToday && " · today"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card divide-y divide-border-hairline">
      {past.length > 0 && (
        <details>
          <summary className="px-4 py-2.5 text-xs text-ink-muted cursor-pointer hover:text-ink-secondary transition-colors">
            Earlier this month ({past.length} {past.length === 1 ? "day" : "days"})
          </summary>
          <div className="divide-y divide-border-hairline border-t border-border-hairline">
            {past.map(dayRow)}
          </div>
        </details>
      )}
      {current.map(dayRow)}
    </div>
  );
}

function AgendaEntry({ entry, direction }: { entry: Entry; direction: "in" | "out" }) {
  const { seg, property } = entry;
  const nights = daysBetweenISO(seg.startDate, seg.endDate) + 1;

  return (
    <Link
      href={seg.href}
      className={`flex items-center gap-2 rounded-xl border px-2 py-2 min-w-0 transition-all duration-150 hover:brightness-125 hover:-translate-y-px ${
        seg.tentative ? "border-dashed" : ""
      }`}
      style={{
        backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${seg.color} 22%, var(--color-surface-1)) 0%, color-mix(in srgb, ${seg.color} 11%, var(--color-surface-1)) 100%)`,
        borderColor: `color-mix(in srgb, ${seg.color} 45%, transparent)`,
        boxShadow: `0 1px 0 rgba(255,255,255,0.05) inset`,
      }}
    >
      <span
        className={`w-8 shrink-0 text-center text-[9px] font-semibold uppercase tracking-wide rounded-md py-0.5 ${
          direction === "in"
            ? "text-hostello-purple-light bg-hostello-purple-glow/15"
            : "text-ink-muted bg-surface-3/60"
        }`}
      >
        {direction}
      </span>
      {seg.kind === "booking" ? (
        <ChannelBadge source={seg.source ?? ""} />
      ) : (
        <Lock size={12} className="shrink-0 text-ink-secondary" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-ink-primary truncate">
          {seg.title}
          <span className="text-ink-muted"> · {property}</span>
        </span>
        <span className="block text-[10px] text-ink-muted">
          {seg.hours
            ? `${seg.dateRange} · ${seg.hours}`
            : `${seg.dateRange} · ${nights} ${nights === 1 ? "night" : "nights"}`}
        </span>
      </span>
      {seg.amount && (
        <span className="text-[10px] text-financial whitespace-nowrap shrink-0">{seg.amount}</span>
      )}
    </Link>
  );
}
