"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { weekdayShort, isWeekend } from "@/lib/calendar";
import { ChannelBadge } from "@/components/admin/BookingActivity";

export type CalendarSegment = {
  key: string;
  kind: "booking" | "block";
  startIdx: number;
  span: number;
  lane: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  color: string;
  source: string | null;
  title: string;
  dateRange: string;
  amount: string | null;
  tentative: boolean;
  href: string;
};

export type CalendarRow = {
  id: string;
  name: string;
  subtext: string;
  lanes: number;
  covered: boolean[];
  segments: CalendarSegment[];
};

export type CalendarGroup = {
  clientId: string;
  clientName: string;
  rows: CalendarRow[];
};

const LANE_HEIGHT = 38;

export function CalendarBoard({
  days,
  today,
  groups,
  cellMin,
  newBookingHref,
}: {
  days: string[];
  today: string;
  groups: CalendarGroup[];
  cellMin: number;
  /** (propertyId, date) => href for an empty day */
  newBookingHref: string;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const columns = `200px repeat(${days.length}, minmax(${cellMin}px, 1fr))`;
  const minWidth = 200 + days.length * cellMin;

  function dayTint(date: string) {
    if (date === today) return "bg-hostello-gold/[0.07] border-l border-hostello-gold/40";
    if (isWeekend(date)) return "bg-surface-2/50";
    return "";
  }

  return (
    <div className="card overflow-x-auto">
      <div style={{ minWidth }}>
        {/* Day header */}
        <div
          className="grid border-b border-border-hairline"
          style={{ gridTemplateColumns: columns }}
        >
          <div className="sticky left-0 z-20 bg-surface-1 px-4 py-3 text-[10px] uppercase tracking-wider text-ink-muted">
            Property
          </div>
          {days.map((d) => (
            <div
              key={d}
              className={`py-2 text-center ${dayTint(d)}`}
              style={{ gridColumn: "auto" }}
            >
              <p className="text-[9px] uppercase tracking-wide text-ink-muted">
                {weekdayShort(d).charAt(0)}
              </p>
              <p
                className={`text-xs mt-0.5 ${
                  d === today
                    ? "font-semibold text-surface-0 mx-auto w-5 h-5 leading-5 rounded-full bg-hostello-gold"
                    : "text-ink-secondary"
                }`}
              >
                {Number(d.slice(8, 10))}
              </p>
            </div>
          ))}
        </div>

        {groups.map((group) => {
          const isCollapsed = collapsed[group.clientId] ?? false;
          return (
            <div key={group.clientId} className="border-b border-border-hairline last:border-0">
              <div className="bg-surface-2/40">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [group.clientId]: !isCollapsed }))
                  }
                  className="sticky left-0 flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-ink-secondary hover:text-ink-primary transition-colors"
                >
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  {group.clientName}
                  <span className="text-ink-muted font-normal">({group.rows.length})</span>
                </button>
              </div>

              {!isCollapsed &&
                group.rows.map((row) => (
                  <div
                    key={row.id}
                    className="grid border-t border-border-hairline"
                    style={{
                      gridTemplateColumns: columns,
                      gridTemplateRows: `repeat(${row.lanes}, ${LANE_HEIGHT}px)`,
                    }}
                  >
                    <div
                      className="sticky left-0 z-20 bg-surface-1 px-4 flex flex-col justify-center border-r border-border-hairline"
                      style={{ gridColumn: 1, gridRow: `1 / -1` }}
                    >
                      <p className="text-xs text-ink-primary truncate">{row.name}</p>
                      {row.subtext && (
                        <p className="text-[10px] text-ink-muted truncate mt-0.5">{row.subtext}</p>
                      )}
                    </div>

                    {days.map((d, i) =>
                      row.covered[i] ? (
                        <div
                          key={d}
                          className={dayTint(d)}
                          style={{ gridColumn: i + 2, gridRow: "1 / -1" }}
                        />
                      ) : (
                        <Link
                          key={d}
                          href={`${newBookingHref}?property=${row.id}&date=${d}`}
                          title={`Add booking — ${d}`}
                          className={`transition-colors hover:bg-hostello-purple-glow/15 ${dayTint(d)}`}
                          style={{ gridColumn: i + 2, gridRow: "1 / -1" }}
                        />
                      )
                    )}

                    {row.segments.map((seg) => (
                      <Bar key={seg.key} seg={seg} />
                    ))}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bar({ seg }: { seg: CalendarSegment }) {
  const showAmount = seg.span >= 3 && seg.amount;
  const showRange = seg.span >= 6;

  return (
    <Link
      href={seg.href}
      title={`${seg.title} · ${seg.dateRange}${seg.amount ? ` · ${seg.amount}` : ""}`}
      className={`relative z-10 my-[4px] flex items-center gap-1.5 overflow-hidden border px-1.5 min-w-0 transition hover:brightness-125 ${
        seg.tentative ? "border-dashed" : ""
      } ${seg.clippedStart ? "ml-0 rounded-l-none" : "ml-[3px] rounded-l-md"} ${
        seg.clippedEnd ? "mr-0 rounded-r-none" : "mr-[3px] rounded-r-md"
      }`}
      style={{
        gridColumn: `${seg.startIdx + 2} / span ${seg.span}`,
        gridRow: seg.lane + 1,
        backgroundColor: `color-mix(in srgb, ${seg.color} 22%, var(--color-surface-1))`,
        borderColor: `color-mix(in srgb, ${seg.color} 55%, transparent)`,
      }}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: seg.color }}
        aria-hidden
      />
      {seg.kind === "booking" ? (
        <ChannelBadge source={seg.source ?? ""} />
      ) : (
        <Lock size={11} className="shrink-0 text-ink-secondary" />
      )}
      <span className="text-[11px] text-ink-primary truncate">{seg.title}</span>
      {showRange && (
        <span className="text-[10px] text-ink-muted whitespace-nowrap shrink-0">
          {seg.dateRange}
        </span>
      )}
      {showAmount && (
        <span className="ml-auto text-[10px] text-financial whitespace-nowrap shrink-0">
          {seg.amount}
        </span>
      )}
    </Link>
  );
}
