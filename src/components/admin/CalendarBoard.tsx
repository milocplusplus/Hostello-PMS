"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Lock, X } from "lucide-react";
import { weekdayShort, isWeekend, addDaysISO, formatDayMonth } from "@/lib/calendar";
import { ChannelBadge } from "@/components/admin/BookingActivity";
import { BookingForm } from "@/components/admin/BookingForm";
import type { UnavailableRange } from "@/lib/availability";

type BookingFormProps = ComponentProps<typeof BookingForm>;

export type CalendarSegment = {
  key: string;
  kind: "booking" | "block";
  startIdx: number;
  span: number;
  lane: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  /** True range, unclipped — the board reads the idx pair, the agenda these. */
  startDate: string;
  /** Last occupied night, inclusive. */
  endDate: string;
  color: string;
  source: string | null;
  title: string;
  dateRange: string;
  /** "2:00 PM – 8:00 PM" on a short stay, null on a booking of nights. */
  hours: string | null;
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

const LANE_HEIGHT = 38;

/** The quick-add write. Admin and client portals each pass their own. */
export type InlineCreate = (formData: FormData) => Promise<{ error: string | null }>;

/**
 * One owner's properties as a timeline. The portfolio-wide board is gone — every
 * calendar is scoped to a single client now, so there are no groups in here.
 */
export function CalendarBoard({
  days,
  today,
  rows,
  cellMin,
  bookingProperties,
  bookingClients,
  createAction,
  unavailable = [],
  allowReceipt = true,
}: {
  days: string[];
  today: string;
  rows: CalendarRow[];
  cellMin: number;
  bookingProperties: BookingFormProps["properties"];
  bookingClients: BookingFormProps["clients"];
  createAction: InlineCreate;
  /** Taken nights beyond this window, so the quick-add picker can grey them out. */
  unavailable?: UnavailableRange[];
  allowReceipt?: boolean;
}) {
  const [draft, setDraft] = useState<{ propertyId: string; propertyName: string; date: string } | null>(
    null
  );
  const columns = `var(--cal-name) repeat(${days.length}, minmax(${cellMin}px, 1fr))`;
  const minWidth = `calc(var(--cal-name) + ${days.length * cellMin}px)`;

  // The window always starts on the 1st, so on the 26th today's column sits off
  // the right edge — on a phone the card is 342px of a 1178px board. Centre it
  // in whatever is visible past the sticky property column. Other months have no
  // today, and are left at the 1st.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    const idx = days.indexOf(today);
    if (!el || idx < 0) return;
    const nameWidth = parseFloat(getComputedStyle(el).getPropertyValue("--cal-name")) || 0;
    const cell = (el.scrollWidth - nameWidth) / days.length;
    // The property column is sticky, so it covers the first nameWidth pixels of
    // the card — centre today in what is left.
    const visible = el.clientWidth - nameWidth;
    el.scrollLeft = Math.max(0, idx * cell + cell / 2 - visible / 2);
  }, [days, today]);

  function dayTint(date: string) {
    if (date === today) return "bg-hostello-gold/[0.09] border-l border-hostello-gold/50";
    if (isWeekend(date)) return "bg-surface-2/50";
    return "";
  }

  return (
    <>
      {/* card-flat: the property column below is sticky and opaque, and would
          show as a flat patch over a gradient card face. */}
      <div
        ref={scroller}
        className="card card-flat overflow-x-auto [--cal-name:124px] md:[--cal-name:200px]"
      >
        <div style={{ minWidth }}>
          {/* Day header */}
          <div
            className="grid border-b border-border-hairline"
            style={{ gridTemplateColumns: columns }}
          >
            <div className="eyebrow sticky left-0 z-20 bg-surface-1 px-3 md:px-4 py-3.5 border-r border-border-hairline">
              Property
            </div>
            {days.map((d) => (
              <div key={d} className={`py-2 text-center ${dayTint(d)}`}>
                <p className="text-[9px] uppercase tracking-wide text-ink-muted">
                  {weekdayShort(d).charAt(0)}
                </p>
                <p
                  className={`num text-xs mt-1 ${
                    d === today
                      ? "font-semibold text-surface-0 mx-auto w-5 h-5 leading-5 rounded-full gradient-gold shadow-[0_0_12px_-2px_var(--color-hostello-gold)]"
                      : "text-ink-secondary"
                  }`}
                >
                  {Number(d.slice(8, 10))}
                </p>
              </div>
            ))}
          </div>

          {rows.map((row) => (
            <div
              key={row.id}
              className="grid border-t border-border-hairline first:border-t-0"
              style={{
                gridTemplateColumns: columns,
                gridTemplateRows: `repeat(${row.lanes}, ${LANE_HEIGHT}px)`,
              }}
            >
              <div
                className="sticky left-0 z-20 bg-surface-1 px-3 md:px-4 flex flex-col justify-center border-r border-border-hairline"
                style={{ gridColumn: 1, gridRow: `1 / -1` }}
              >
                <p className="text-xs font-medium text-ink-primary truncate">{row.name}</p>
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
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setDraft({ propertyId: row.id, propertyName: row.name, date: d })
                    }
                    title={`Add booking — ${d}`}
                    className={`transition-colors hover:bg-hostello-purple-glow/20 hover:shadow-[inset_0_0_0_1px_var(--color-hostello-purple-glow)] ${dayTint(d)}`}
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
      </div>

      {draft && (
        <QuickAddBooking
          draft={draft}
          properties={bookingProperties}
          clients={bookingClients}
          createAction={createAction}
          unavailable={unavailable}
          allowReceipt={allowReceipt}
          onClose={() => setDraft(null)}
        />
      )}
    </>
  );
}

/**
 * Quick-add for a single clicked day. The clicked date is one night, so
 * check-out defaults to the morning after; both fields stay editable.
 */
function QuickAddBooking({
  draft,
  properties,
  clients,
  createAction,
  unavailable,
  allowReceipt,
  onClose,
}: {
  draft: { propertyId: string; propertyName: string; date: string };
  properties: BookingFormProps["properties"];
  clients: BookingFormProps["clients"];
  createAction: InlineCreate;
  unavailable: UnavailableRange[];
  allowReceipt: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(formData: FormData) {
    const result = await createAction(formData);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  const checkOut = addDaysISO(draft.date, 1);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-y-auto p-4 sm:p-8 animate-fade"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-w-lg mx-auto animate-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add a booking"
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-lg font-semibold">Add a booking</h2>
            <p className="text-xs text-ink-muted mt-1">
              {draft.propertyName} · {formatDayMonth(draft.date)} → {formatDayMonth(checkOut)} · 1 night
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-2 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <BookingForm
          action={submit}
          properties={properties}
          clients={clients}
          initialPropertyId={draft.propertyId}
          initialDate={draft.date}
          initialCheckOut={checkOut}
          unavailable={unavailable}
          allowReceipt={allowReceipt}
          error={error}
        />
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
      title={`${seg.title} · ${seg.dateRange}${seg.hours ? ` · ${seg.hours}` : ""}${
        seg.amount ? ` · ${seg.amount}` : ""
      }`}
      className={`relative z-10 my-[4px] flex items-center gap-1.5 overflow-hidden border px-1.5 min-w-0 transition-all duration-150 hover:brightness-125 hover:-translate-y-px ${
        seg.tentative ? "border-dashed" : ""
      } ${seg.clippedStart ? "ml-0 rounded-l-none" : "ml-[3px] rounded-l-lg"} ${
        seg.clippedEnd ? "mr-0 rounded-r-none" : "mr-[3px] rounded-r-lg"
      }`}
      style={{
        gridColumn: `${seg.startIdx + 2} / span ${seg.span}`,
        gridRow: seg.lane + 1,
        // Lit from the channel's own colour rather than filled flat with it, so
        // a dozen bars on one board still read as distinct objects.
        backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${seg.color} 34%, var(--color-surface-1)) 0%, color-mix(in srgb, ${seg.color} 18%, var(--color-surface-1)) 100%)`,
        borderColor: `color-mix(in srgb, ${seg.color} 55%, transparent)`,
        boxShadow: `0 1px 0 rgba(255,255,255,0.06) inset, 0 4px 12px -6px ${seg.color}`,
      }}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: seg.color, boxShadow: `0 0 8px -1px ${seg.color}` }}
        aria-hidden
      />
      {seg.kind === "booking" ? (
        <ChannelBadge source={seg.source ?? ""} />
      ) : (
        <Lock size={11} className="shrink-0 text-ink-secondary" />
      )}
      {/* A short stay is one cell wide like a one-night booking — the clock is
          what tells them apart at a glance. */}
      {seg.hours && <Clock size={10} className="shrink-0 text-ink-muted" />}
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
