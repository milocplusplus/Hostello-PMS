import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { sourceColor } from "@/lib/block-sources";
import { propertyTypeLabel } from "@/lib/property-types";
import { formatPKR, type DealModel, type OtaModel } from "@/lib/payout";
import { createClientBookingInline } from "@/app/client/bookings/actions";
import { listUnavailable } from "@/lib/availability";
import { formatShortStayWindow, rowShortStay } from "@/lib/short-stay";
import {
  CalendarBoard,
  type CalendarRow,
  type CalendarSegment,
} from "@/components/admin/CalendarBoard";
import { CalendarAgenda } from "@/components/shared/CalendarAgenda";
import {
  getMonthGrid,
  formatMonthLabel,
  parseMonthParam,
  formatMonthParam,
  addMonths,
  todayISO,
  addDaysISO,
  daysFrom,
  startOfWeekISO,
  formatDayMonth,
  formatRangeLabel,
} from "@/lib/calendar";

type Params = { month?: string; view?: string; start?: string };

export default async function ClientCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, type, city, stack_rate, short_stay_stack_rate")
    .eq("client_id", clientRecord.id)
    .eq("status", "active")
    .order("name");

  const { year, month0 } = parseMonthParam(sp.month);
  const monthStr = formatMonthParam(year, month0);

  if (!properties || properties.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-ink-muted text-xs tracking-wide">AVAILABILITY</p>
          <h1 className="text-2xl font-semibold mt-1">Calendar</h1>
        </div>
        <div className="card p-8 md:p-10 text-center text-sm text-ink-secondary">
          No active properties yet.
        </div>
      </div>
    );
  }

  function href(overrides: Partial<Record<keyof Params, string | undefined>>) {
    const merged = { ...sp, ...overrides };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/client/calendar?${qs}` : "/client/calendar";
  }

  // ---- Window -------------------------------------------------------------
  const today = todayISO();
  const view = sp.view === "week" || sp.view === "agenda" ? sp.view : "month";
  // A month of 34px cells is ~1180px wide — it does not fit a phone at all. With
  // no view asked for, the phone gets the agenda and the desktop gets the board;
  // picking "month" explicitly still gets the board (scrollable) on both.
  const autoAgenda = view === "month" && !sp.view;

  let days: string[];
  let rangeLabel: string;
  let prevHref: string;
  let nextHref: string;

  if (view === "week") {
    const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(sp.start ?? "")
      ? (sp.start as string)
      : startOfWeekISO(today);
    days = daysFrom(weekStart, 7);
    rangeLabel = formatRangeLabel(days[0], days[6]);
    prevHref = href({ start: addDaysISO(weekStart, -7) });
    nextHref = href({ start: addDaysISO(weekStart, 7) });
  } else {
    days = getMonthGrid(year, month0)
      .filter((c) => c.date !== null)
      .map((c) => c.date as string);
    rangeLabel = formatMonthLabel(year, month0);
    const prev = addMonths(year, month0, -1);
    const next = addMonths(year, month0, 1);
    prevHref = href({ month: formatMonthParam(prev.year, prev.month0) });
    nextHref = href({ month: formatMonthParam(next.year, next.month0) });
  }

  const windowStart = days[0];
  const windowEnd = days[days.length - 1];
  const dayIdx = new Map(days.map((d, i) => [d, i]));

  const propertyIds = properties.map((p) => p.id);

  // Blocks depend only on the property ids, so they ride along with the link
  // lookup instead of waiting behind the bookings fetch.
  const [{ data: bookingLinks }, { data: blocks }] = await Promise.all([
    supabase
      .from("booking_properties")
      .select("booking_id, property_id")
      .in("property_id", propertyIds),
    supabase
      .from("calendar_blocks")
      .select("id, property_id, start_date, end_date, block_type, notes")
      .in("property_id", propertyIds)
      .lte("start_date", windowEnd)
      .gte("end_date", windowStart),
  ]);

  const bookingIds = [...new Set((bookingLinks ?? []).map((l) => l.booking_id))];

  let bookings: {
    id: string;
    check_in: string;
    check_out: string;
    source: string;
    status: string;
    guest_name: string | null;
    client_payout: number | null;
    is_short_stay: boolean;
    short_stay_start: string | null;
    short_stay_end: string | null;
  }[] = [];

  if (bookingIds.length > 0) {
    const { data } = await supabase
      .from("bookings")
      .select(
        "id, check_in, check_out, source, status, guest_name, client_payout, is_short_stay, short_stay_start, short_stay_end"
      )
      .in("id", bookingIds)
      .neq("status", "cancelled")
      .lte("check_in", windowEnd)
      .gt("check_out", windowStart);
    bookings = data ?? [];
  }

  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const bookingsByProperty = new Map<string, typeof bookings>();
  for (const link of bookingLinks ?? []) {
    const b = bookingById.get(link.booking_id);
    if (!b) continue;
    const list = bookingsByProperty.get(link.property_id) ?? [];
    list.push(b);
    bookingsByProperty.set(link.property_id, list);
  }

  const blocksByProperty = new Map<string, NonNullable<typeof blocks>>();
  for (const b of blocks ?? []) {
    const list = blocksByProperty.get(b.property_id) ?? [];
    list.push(b);
    blocksByProperty.set(b.property_id, list);
  }

  /** Clips an inclusive date range to the visible window. */
  function place(startDate: string, lastDate: string) {
    if (lastDate < windowStart || startDate > windowEnd) return null;
    const from = startDate < windowStart ? windowStart : startDate;
    const to = lastDate > windowEnd ? windowEnd : lastDate;
    const startIdx = dayIdx.get(from)!;
    const endIdx = dayIdx.get(to)!;
    return {
      startIdx,
      span: endIdx - startIdx + 1,
      clippedStart: startDate < windowStart,
      clippedEnd: lastDate > windowEnd,
    };
  }

  function buildRow(p: NonNullable<typeof properties>[number]): CalendarRow {
    const segments: CalendarSegment[] = [];

    for (const b of bookingsByProperty.get(p.id) ?? []) {
      // check_out is exclusive — the last occupied night is the day before.
      const lastNight = addDaysISO(b.check_out, -1);
      const pos = place(b.check_in, lastNight);
      if (!pos) continue;
      const shortStay = rowShortStay(b);
      segments.push({
        key: `b-${b.id}`,
        kind: "booking",
        ...pos,
        lane: 0,
        startDate: b.check_in,
        endDate: lastNight,
        color: sourceColor(b.source),
        source: b.source,
        title: b.guest_name ?? "Guest",
        // A short stay leaves the day it arrives — its hours are the range.
        dateRange: shortStay
          ? formatDayMonth(b.check_in)
          : `${formatDayMonth(b.check_in)} – ${formatDayMonth(b.check_out)}`,
        hours: shortStay && formatShortStayWindow(shortStay.start, shortStay.end),
        // Owners see their own payout, never Hostello's share.
        amount: b.client_payout ? formatPKR(b.client_payout) : null,
        tentative: b.status === "tentative",
        href: `/client/bookings/${b.id}`,
      });
    }

    for (const bl of blocksByProperty.get(p.id) ?? []) {
      // calendar_blocks.end_date is inclusive.
      const pos = place(bl.start_date, bl.end_date);
      if (!pos) continue;
      const booked = bl.block_type === "booked";
      segments.push({
        key: `k-${bl.id}`,
        kind: "block",
        ...pos,
        lane: 0,
        startDate: bl.start_date,
        endDate: bl.end_date,
        color: booked ? "var(--color-status-booked)" : "var(--color-status-blocked)",
        source: null,
        title: bl.notes ?? (booked ? "Booked" : "Blocked"),
        dateRange: `${formatDayMonth(bl.start_date)} – ${formatDayMonth(bl.end_date)}`,
        hours: null,
        amount: null,
        tentative: false,
        href: `/client/calendar/block?month=${monthStr}`,
      });
    }

    // Stack overlapping bars into lanes instead of drawing them on top of each other.
    segments.sort((a, b) => a.startIdx - b.startIdx || b.span - a.span);
    const laneEnds: number[] = [];
    for (const seg of segments) {
      let lane = laneEnds.findIndex((end) => end < seg.startIdx);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(-1);
      }
      laneEnds[lane] = seg.startIdx + seg.span - 1;
      seg.lane = lane;
    }

    const covered = new Array(days.length).fill(false);
    for (const seg of segments) {
      for (let i = seg.startIdx; i < seg.startIdx + seg.span; i++) covered[i] = true;
    }

    return {
      id: p.id,
      name: p.name,
      subtext: [propertyTypeLabel(p.type), p.city].filter(Boolean).join(" · "),
      lanes: Math.max(1, laneEnds.length),
      covered,
      segments,
    };
  }

  const rows = properties.map(buildRow);

  const bookingProperties = properties.map((p) => ({
    id: p.id,
    name: p.name,
    stack_rate: Number(p.stack_rate ?? 0),
    short_stay_stack_rate: Number(p.short_stay_stack_rate ?? 0),
    client_id: clientRecord.id,
    client_name: clientRecord.name,
  }));

  const bookingClients = [
    {
      id: clientRecord.id,
      deal_model: clientRecord.deal_model as DealModel,
      share_percent: Number(clientRecord.share_percent),
      deduct_percent: Number(clientRecord.deduct_percent),
      ota_model: clientRecord.ota_model as OtaModel,
      ota_share_percent: Number(clientRecord.ota_share_percent),
    },
  ];

  // The board only knows what is taken inside the month on screen; the quick-add
  // picker lets you scroll past it, so it gets the full forward-looking set.
  const unavailable = await listUnavailable(
    supabase,
    bookingProperties.map((p) => p.id)
  );

  const legend: { label: string; color: string }[] = [
    { label: "Airbnb", color: sourceColor("airbnb") },
    { label: "Booking.com", color: sourceColor("booking_com") },
    { label: "Hostello Direct", color: sourceColor("hostello") },
    { label: "Your own booking", color: sourceColor("client") },
    { label: "Blocked", color: "var(--color-status-blocked)" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-ink-muted text-xs tracking-wide">AVAILABILITY</p>
          <h1 className="text-2xl font-semibold mt-1">Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/client/calendar/block?month=${monthStr}`}
            className="rounded-md py-2 px-3 text-xs font-medium text-ink-secondary border border-border-hairline flex items-center gap-1.5 hover:border-border-strong transition-colors"
          >
            <Lock size={13} />
            Block dates
          </Link>
          <Link
            href="/client/bookings/new"
            className="rounded-md py-2 px-3 text-xs font-medium text-surface-0 flex items-center gap-1.5"
            style={{ backgroundColor: "var(--color-hostello-gold)" }}
          >
            <Plus size={13} strokeWidth={2.5} />
            Add booking
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Link
            href={prevHref}
            aria-label="Previous"
            className="p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
          >
            <ChevronLeft size={16} />
          </Link>
          <p className="text-sm font-medium min-w-[150px] text-center">{rangeLabel}</p>
          <Link
            href={nextHref}
            aria-label="Next"
            className="p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
          >
            <ChevronRight size={16} />
          </Link>
          {(sp.month || sp.start) && (
            <Link
              href={href({ month: undefined, start: undefined })}
              className="ml-1 text-xs text-ink-muted hover:text-ink-secondary transition-colors"
            >
              Today
            </Link>
          )}
        </div>

        <div className="flex items-center rounded-md border border-border-hairline p-0.5">
          {(["month", "week", "agenda"] as const).map((v) => (
            <Link
              key={v}
              href={href({ view: v === "month" ? undefined : v, start: undefined })}
              className={`px-3 py-1 rounded text-xs capitalize transition-colors ${
                // With autoAgenda the phone is really on agenda and the desktop
                // on month, so the highlight has to say so at each width.
                view === v
                  ? autoAgenda && v === "month"
                    ? "text-ink-secondary md:bg-hostello-purple-glow md:text-white"
                    : "bg-hostello-purple-glow text-white"
                  : autoAgenda && v === "agenda"
                    ? "bg-hostello-purple-glow text-white md:bg-transparent md:text-ink-secondary"
                    : "text-ink-secondary hover:text-ink-primary"
              }`}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>

      {view !== "agenda" && (
        <div
          className={`${autoAgenda ? "hidden md:flex" : "flex"} items-center gap-4 text-[11px] text-ink-secondary flex-wrap`}
        >
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: l.color }}
              />
              {l.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm border border-border-strong" />
            Available — click to book
          </span>
        </div>
      )}

      {(view === "agenda" || autoAgenda) && (
        <div className={autoAgenda ? "md:hidden" : undefined}>
          <CalendarAgenda days={days} today={today} rows={rows} />
        </div>
      )}
      {view !== "agenda" && (
        <div className={autoAgenda ? "hidden md:block" : undefined}>
          <CalendarBoard
            days={days}
            today={today}
            rows={rows}
            cellMin={view === "week" ? 130 : 34}
            bookingProperties={bookingProperties}
            bookingClients={bookingClients}
            createAction={createClientBookingInline}
            unavailable={unavailable}
            allowReceipt={false}
          />
        </div>
      )}

      <p className="text-xs text-ink-muted">
        {properties.length} {properties.length === 1 ? "property" : "properties"}
      </p>
    </div>
  );
}
