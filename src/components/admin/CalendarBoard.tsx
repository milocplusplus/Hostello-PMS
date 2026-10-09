"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Home, Lock, X } from "lucide-react";
import { weekdayShort, isWeekend, addDaysISO, formatDayMonth } from "@/lib/calendar";
import { sourceInitial } from "@/lib/block-sources";
import { unitArt } from "@/lib/unit-tint";
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
  photo?: string | null;
};

const LANE_HEIGHT = 42;

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
  canSetShare = false,
  bookingDefaults,
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
  /** The admin's calendar: the quick-add form lets them type what Hostello earns. */
  canSetShare?: boolean;
  bookingDefaults?: BookingFormProps["defaults"];
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
    if (date === today)
      return "bg-hostello-gold/[0.1] shadow-[inset_1px_0_0_rgba(245,201,104,0.45),inset_-1px_0_0_rgba(245,201,104,0.45)]";
    if (isWeekend(date)) return "bg-white/[0.025]";
    return "";
  }

  return (
    <>
      {/* card-flat: the property column below is sticky and opaque, and would
          show as a flat patch over a gradient card face. */}
      <div
        ref={scroller}
        className="card card-flat overflow-x-auto [--cal-name:112px] md:[--cal-name:210px]"
      >
        <div style={{ minWidth }}>
          {/* Day header */}
          <div
            className="grid border-b border-border-hairline"
            style={{ gridTemplateColumns: columns }}
          >
            <div className="sticky left-0 z-20 bg-surface-1 border-r border-border-hairline" />
            {days.map((d) => (
              <div key={d} className={`py-2 text-center ${dayTint(d)}`}>
                <p className="text-[10px] font-bold uppercase text-ink-muted">
                  {weekdayShort(d).charAt(0)}
                </p>
                <p
                  className={`num text-[13px] font-bold mt-1 ${
                    d === today
                      ? "font-extrabold text-surface-0 mx-auto w-6 h-6 leading-6 rounded-full gradient-gold shadow-[0_0_14px_-2px_var(--color-hostello-gold-bright)]"
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
                className="sticky left-0 z-20 bg-surface-1 px-2.5 md:px-4 flex items-center gap-2 md:gap-2.5 border-r border-border-hairline"
                style={{ gridColumn: 1, gridRow: `1 / -1` }}
              >
                <span
                  className="w-7 h-7 md:w-8 md:h-8 rounded-[10px] shrink-0 flex items-center justify-center text-white/90"
                  style={{ background: unitArt(row.name, row.photo) }}
                  aria-hidden
                >
                  {!row.photo && <Home size={15} />}
                </span>
                <span className="min-w-0">
                  {/* A narrow phone column truncates most names to nothing
                      useful, and the lane is tall enough for two short lines. */}
                  <span className="block text-[11px] leading-tight line-clamp-2 md:text-[13px] md:leading-normal md:line-clamp-none md:truncate font-bold text-ink-primary">
                    {row.name}
                  </span>
                  {/* On a phone the subtext only ever renders as an ellipsis. */}
                  {row.subtext && (
                    <span className="hidden md:block text-[11px] text-ink-muted truncate">
                      {row.subtext}
                    </span>
                  )}
                </span>
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
          canSetShare={canSetShare}
          defaults={bookingDefaults}
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
  canSetShare,
  defaults,
  onClose,
}: {
  draft: { propertyId: string; propertyName: string; date: string };
  properties: BookingFormProps["properties"];
  clients: BookingFormProps["clients"];
  createAction: InlineCreate;
  unavailable: UnavailableRange[];
  allowReceipt: boolean;
  canSetShare: boolean;
  defaults?: BookingFormProps["defaults"];
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
      className="fixed inset-0 z-50 bg-black/75 overflow-y-auto p-4 sm:p-8 animate-fade"
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
          canSetShare={canSetShare}
          defaults={defaults}
          error={error}
        />
      </div>
    </div>
  );
}

function Bar({ seg }: { seg: CalendarSegment }) {
  const showAmount = seg.span >= 3 && seg.amount;
  const showRange = seg.span >= 6;
  const block = seg.kind === "block";

  // Filled with the channel colour so the board reads at a glance. A tentative
  // stay is an outline and a block is hatched: neither is a stay being paid for.
  const face = block
    ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${seg.color} 55%, transparent) 0 6px, color-mix(in srgb, ${seg.color} 22%, transparent) 6px 12px)`
    : seg.tentative
      ? `linear-gradient(90deg, color-mix(in srgb, ${seg.color} 30%, var(--color-surface-1)), color-mix(in srgb, ${seg.color} 16%, var(--color-surface-1)))`
      : `linear-gradient(90deg, color-mix(in srgb, ${seg.color} 72%, #000) 0%, ${seg.color} 100%)`;
  const outlined = seg.tentative || block;

  return (
    <Link
      href={seg.href}
      title={`${seg.title} · ${seg.dateRange}${seg.hours ? ` · ${seg.hours}` : ""}${
        seg.amount ? ` · ${seg.amount}` : ""
      }`}
      className={`bar-grow relative z-10 my-[5px] flex items-center gap-1.5 overflow-hidden border px-1.5 min-w-0 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)] transition-[filter,transform] duration-150 hover:brightness-110 hover:-translate-y-px ${
        seg.tentative ? "border-dashed" : ""
      } ${seg.clippedStart ? "ml-0 rounded-l-none" : "ml-[3px] rounded-l-xl"} ${
        seg.clippedEnd ? "mr-0 rounded-r-none" : "mr-[3px] rounded-r-xl"
      }`}
      style={{
        gridColumn: `${seg.startIdx + 2} / span ${seg.span}`,
        gridRow: seg.lane + 1,
        backgroundImage: face,
        borderColor: outlined ? `color-mix(in srgb, ${seg.color} 70%, transparent)` : "transparent",
        boxShadow: outlined ? undefined : `0 6px 16px -8px ${seg.color}`,
        animationDelay: `${Math.min(seg.startIdx * 14, 420)}ms`,
      }}
    >
      {block ? (
        <Lock size={11} className="shrink-0" />
      ) : (
        <span
          className="w-[18px] h-[18px] rounded-full bg-black/25 text-[9px] font-extrabold flex items-center justify-center shrink-0"
          aria-hidden
        >
          {sourceInitial(seg.source)}
        </span>
      )}
      {/* A short stay is one cell wide like a one-night booking; the clock is
          what tells them apart at a glance. */}
      {seg.hours && <Clock size={10} className="shrink-0" />}
      <span className="text-[11px] font-bold truncate">{seg.title}</span>
      {showRange && (
        <span className="text-[10px] text-white/75 whitespace-nowrap shrink-0">{seg.dateRange}</span>
      )}
      {showAmount && (
        <span className="num ml-auto text-[10px] font-extrabold whitespace-nowrap shrink-0">{seg.amount}</span>
      )}
    </Link>
  );
}
