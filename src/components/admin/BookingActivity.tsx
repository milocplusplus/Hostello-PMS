"use client";

import { useState } from "react";
import { formatDayMonth } from "@/lib/calendar";
import { sourceLabel, sourceColor, sourceInitial } from "@/lib/block-sources";
import { Avatar } from "@/components/shared/Avatar";
import { StatusChip } from "@/components/shared/StatusChip";

export type ActivityBooking = {
  id: string;
  guestName: string | null;
  clientName: string | null;
  units: string;
  checkIn: string;
  checkOut: string;
  source: string;
  status: string;
};

type TabKey = "upcoming" | "checkins" | "checkouts";

const TABS: { key: TabKey; label: string; empty: string }[] = [
  { key: "upcoming", label: "Upcoming", empty: "No bookings in the next 30 days." },
  { key: "checkins", label: "Check-ins", empty: "No arrivals in the next 7 days." },
  { key: "checkouts", label: "Check-outs", empty: "No departures in the next 7 days." },
];

export function ChannelBadge({ source }: { source: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white shrink-0"
      style={{ backgroundColor: sourceColor(source) }}
      aria-hidden
    >
      {sourceInitial(source)}
    </span>
  );
}

export function BookingActivity({
  upcoming,
  checkins,
  checkouts,
}: {
  upcoming: ActivityBooking[];
  checkins: ActivityBooking[];
  checkouts: ActivityBooking[];
}) {
  const [tab, setTab] = useState<TabKey>("upcoming");
  const lists: Record<TabKey, ActivityBooking[]> = { upcoming, checkins, checkouts };
  const rows = lists[tab];

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active
                  ? "bg-hostello-purple-glow text-white"
                  : "text-ink-secondary hover:text-ink-primary hover:bg-surface-2"
              }`}
            >
              {t.label}
              <span className={active ? "ml-1.5 text-white/70" : "ml-1.5 text-ink-muted"}>
                {lists[t.key].length}
              </span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-surface-2/60 px-5 py-10 text-center text-sm text-ink-secondary">
          {TABS.find((t) => t.key === tab)!.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((b) => (
            <li
              key={b.id}
              className="rounded-lg bg-surface-2/60 px-3 py-2.5 grid gap-3 items-center grid-cols-[1fr_auto] sm:grid-cols-[1.3fr_1fr_auto]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={b.units || b.clientName} size={38} rounded="lg" />
                <div className="min-w-0">
                  <p className="text-sm text-ink-primary truncate">{b.units || b.clientName || "—"}</p>
                  <p className="text-xs text-ink-secondary mt-0.5 whitespace-nowrap">
                    {formatDayMonth(b.checkIn)} – {formatDayMonth(b.checkOut)}
                  </p>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-2.5 min-w-0">
                <Avatar name={b.guestName} size={30} />
                <div className="min-w-0">
                  <p className="text-sm text-ink-primary truncate">{b.guestName ?? "Guest"}</p>
                  <p className="text-xs text-ink-secondary mt-0.5 flex items-center gap-1.5 truncate">
                    <ChannelBadge source={b.source} />
                    {sourceLabel(b.source) ?? b.source}
                  </p>
                </div>
              </div>

              <StatusChip status={b.status} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
