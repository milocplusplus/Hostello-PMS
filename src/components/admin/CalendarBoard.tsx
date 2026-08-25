"use client";

import { useEffect, useState, type ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Lock, X } from "lucide-react";
import { weekdayShort, isWeekend, addDaysISO, formatDayMonth } from "@/lib/calendar";
import { ChannelBadge } from "@/components/admin/BookingActivity";
import { BookingForm } from "@/components/admin/BookingForm";

type BookingFormProps = ComponentProps<typeof BookingForm>;

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

/** The quick-add write. Admin and client portals each pass their own. */
export type InlineCreate = (formData: FormData) => Promise<{ error: string | null }>;

export function CalendarBoard({
  days,
  today,
  groups,
  cellMin,
  bookingProperties,
  bookingClients,
  createAction,
  groupHeaders = true,
  allowReceipt = true,
}: {
  days: string[];
  today: string;
  groups: CalendarGroup[];
  cellMin: number;
  bookingProperties: BookingFormProps["properties"];
  bookingClients: BookingFormProps["clients"];
  createAction: InlineCreate;
  groupHeaders?: boolean;
  allowReceipt?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<{ propertyId: string; propertyName: string; date: string } | null>(
    null
  );
  const columns = `200px repeat(${days.length}, minmax(${cellMin}px, 1fr))`;
  const minWidth = 200 + days.length * cellMin;

  function dayTint(date: string) {
    if (date === today) return "bg-hostello-gold/[0.07] border-l border-hostello-gold/40";
    if (isWeekend(date)) return "bg-surface-2/50";
    return "";
  }

  return (
    <>
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
          const isCollapsed = groupHeaders ? collapsed[group.clientId] ?? false : false;
          return (
            <div key={group.clientId} className="border-b border-border-hairline last:border-0">
              {groupHeaders && (
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
              )}

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
                        <button
                          key={d}
                          type="button"
                          onClick={() =>
                            setDraft({ propertyId: row.id, propertyName: row.name, date: d })
                          }
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

    {draft && (
      <QuickAddBooking
        draft={draft}
        properties={bookingProperties}
        clients={bookingClients}
        createAction={createAction}
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
  allowReceipt,
  onClose,
}: {
  draft: { propertyId: string; propertyName: string; date: string };
  properties: BookingFormProps["properties"];
  clients: BookingFormProps["clients"];
  createAction: InlineCreate;
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
      className="fixed inset-0 z-50 bg-black/70 overflow-y-auto p-4 sm:p-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-w-lg mx-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add a booking"
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-lg font-medium">Add a booking</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              {draft.propertyName} · {formatDayMonth(draft.date)} → {formatDayMonth(checkOut)} · 1 night
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-ink-muted hover:text-ink-primary hover:bg-surface-2 transition-colors"
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
