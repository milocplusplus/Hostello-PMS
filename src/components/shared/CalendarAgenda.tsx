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
      if (seg.kind === "booking" && !seg.clippedEnd && outIdx < days.length) {
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
      <div className="card p-10 text-center text-sm text-ink-secondary">
        Nothing scheduled this month. Switch to Month to book a night.
      </div>
    );
  }

  return (
    <div className="card divide-y divide-border-hairline">
      {shown.map((i) => {
        const date = days[i];
        const isToday = date === today;
        return (
          <div key={date} className="flex gap-3 p-3 md:p-4">
            <div className="w-11 shrink-0 text-center">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                {weekdayShort(date)}
              </p>
              <p
                className={`text-lg leading-tight ${
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
      })}
    </div>
  );
}

function AgendaEntry({ entry, direction }: { entry: Entry; direction: "in" | "out" }) {
  const { seg, property } = entry;
  const nights = daysBetweenISO(seg.startDate, seg.endDate) + 1;

  return (
    <Link
      href={seg.href}
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 min-w-0 transition hover:brightness-125 ${
        seg.tentative ? "border-dashed" : ""
      }`}
      style={{
        backgroundColor: `color-mix(in srgb, ${seg.color} 14%, var(--color-surface-1))`,
        borderColor: `color-mix(in srgb, ${seg.color} 45%, transparent)`,
      }}
    >
      <span
        className={`w-7 shrink-0 text-[9px] font-semibold uppercase tracking-wide ${
          direction === "in" ? "text-hostello-purple-light" : "text-ink-muted"
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
          {seg.dateRange} · {nights} {nights === 1 ? "night" : "nights"}
        </span>
      </span>
      {seg.amount && (
        <span className="text-[10px] text-financial whitespace-nowrap shrink-0">{seg.amount}</span>
      )}
    </Link>
  );
}
