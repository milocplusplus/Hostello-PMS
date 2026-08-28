import Link from "next/link";
import { LogIn, LogOut, BedDouble, Phone } from "lucide-react";
import {
  StayTick,
  type ProgressStep,
  type StayProgressAction,
} from "@/components/shared/StayProgress";
import { Avatar } from "@/components/shared/Avatar";
import { StatusChip } from "@/components/shared/StatusChip";
import { ChannelBadge } from "@/components/admin/BookingActivity";
import { formatPKR, nightsBetween } from "@/lib/payout";
import { formatDayMonth } from "@/lib/calendar";

/** One stay, already scoped to whichever portal is rendering it. */
export type TodayStay = {
  id: string;
  guestName: string | null;
  units: string;
  clientName: string | null;
  guests: number | null;
  phone: string | null;
  source: string;
  status: string;
  checkIn: string;
  checkOut: string;
  /** Sale price for admins, owner payout for clients — the page decides. */
  amount: number | null;
  href: string;
  /** Set once the arrival was handled. Null = still outstanding. */
  checkedInAt: string | null;
  /** Set once the departure was handled. Null = still outstanding. */
  checkedOutAt: string | null;
};

function StayRow({
  stay,
  step,
  progressAction,
}: {
  stay: TodayStay;
  /** Which tick this row carries, if any — arrivals check in, departures out. */
  step?: ProgressStep;
  progressAction?: StayProgressAction;
}) {
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const done = step === "in" ? Boolean(stay.checkedInAt) : step === "out" ? Boolean(stay.checkedOutAt) : false;

  return (
    <li className={`flex items-center gap-3 px-4 py-3 transition-opacity ${done ? "opacity-45" : ""}`}>
      <Avatar name={stay.guestName} size={34} />
      <div className="min-w-0 flex-1">
        <Link
          href={stay.href}
          className="text-sm text-ink-primary hover:text-hostello-gold transition-colors truncate block"
        >
          {stay.guestName ?? "Guest"}
        </Link>
        <p className="text-xs text-ink-secondary truncate mt-0.5">
          {stay.units || stay.clientName || "—"}
          {stay.guests ? ` · ${stay.guests} guest${stay.guests === 1 ? "" : "s"}` : ""}
        </p>
        <p className="text-[11px] text-ink-muted mt-1 flex items-center gap-1.5 flex-wrap">
          <ChannelBadge source={stay.source} />
          {formatDayMonth(stay.checkIn)} – {formatDayMonth(stay.checkOut)} · {nights}{" "}
          {nights === 1 ? "night" : "nights"}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <StatusChip status={stay.status} />
        {stay.amount !== null && (
          <span className="text-xs text-ink-secondary">{formatPKR(stay.amount)}</span>
        )}
        {stay.phone && (
          <a
            href={`tel:${stay.phone}`}
            className="text-[11px] text-ink-muted hover:text-ink-primary transition-colors flex items-center gap-1"
          >
            <Phone size={11} />
            {stay.phone}
          </a>
        )}
      </div>

      {step && progressAction && (
        <StayTick bookingId={stay.id} step={step} done={done} action={progressAction} />
      )}
    </li>
  );
}

/**
 * One tickable list of stays. The day sheet builds three of these; the
 * check-in board builds its own set over a wider window, so it lives here
 * rather than in either page.
 */
export function StaySection({
  title,
  note,
  icon: Icon,
  tint,
  stays,
  empty,
  step,
  progressAction,
}: {
  title: string;
  /** One line under the title, where the grouping needs explaining. */
  note?: string;
  icon: typeof LogIn;
  tint: string;
  stays: TodayStay[];
  empty: string;
  step?: ProgressStep;
  progressAction?: StayProgressAction;
}) {
  // "2 of 5" says more than "5" on a section you are working through — but only
  // where there is something to tick, and only once one has been.
  const done = step
    ? stays.filter((s) => (step === "in" ? s.checkedInAt : s.checkedOutAt)).length
    : 0;
  const allDone = step && stays.length > 0 && done === stays.length;

  return (
    <section className="card overflow-hidden flex flex-col">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-hairline">
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${tint} 20%, transparent)` }}
        >
          <Icon size={14} style={{ color: tint }} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          {note && <p className="text-[11px] text-ink-muted mt-0.5">{note}</p>}
        </div>
        {allDone && <span className="text-[11px] text-positive">All done</span>}
        <span className="text-xs text-ink-muted tabular-nums">
          {step && done > 0 && !allDone ? `${done} of ${stays.length}` : stays.length}
        </span>
      </div>
      {stays.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-ink-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border-hairline)]">
          {stays.map((s) => (
            <StayRow key={s.id} stay={s} step={step} progressAction={progressAction} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The day sheet both portals share: who arrives, who leaves, who stays on.
 * Rows come in pre-scoped — admins get every client, an owner gets their own.
 */
export function TodayBoard({
  arrivals,
  departures,
  staying,
  progressAction,
}: {
  arrivals: TodayStay[];
  departures: TodayStay[];
  staying: TodayStay[];
  /** Ticking arrivals and departures off. Each portal passes its own write. */
  progressAction?: StayProgressAction;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <StaySection
        title="Arriving today"
        icon={LogIn}
        tint="var(--color-positive)"
        stays={arrivals}
        empty="No arrivals today."
        step="in"
        progressAction={progressAction}
      />
      <StaySection
        title="Departing today"
        icon={LogOut}
        tint="var(--color-hostello-purple-glow)"
        stays={departures}
        empty="No departures today."
        step="out"
        progressAction={progressAction}
      />
      <StaySection
        title="Staying tonight"
        icon={BedDouble}
        tint="var(--color-hostello-gold)"
        stays={staying}
        empty="No one in house tonight."
      />
    </div>
  );
}
