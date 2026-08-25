import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sourceColor } from "@/lib/block-sources";
import { propertyTypeLabel } from "@/lib/property-types";
import { formatPKR, type DealModel } from "@/lib/payout";
import { createClientBookingInline } from "@/app/client/bookings/actions";
import {
  CalendarBoard,
  type CalendarGroup,
  type CalendarRow,
  type CalendarSegment,
} from "@/components/admin/CalendarBoard";
import {
  getMonthGrid,
  formatMonthLabel,
  parseMonthParam,
  formatMonthParam,
  addMonths,
  todayISO,
  addDaysISO,
  formatDayMonth,
} from "@/lib/calendar";

export default async function ClientCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name, deal_model, share_percent, deduct_percent")
    .eq("owner_user_id", user.id)
    .single();
  if (!clientRecord) redirect("/client");

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, type, city, stack_rate")
    .eq("client_id", clientRecord.id)
    .eq("status", "active")
    .order("name");

  const { year, month0 } = parseMonthParam(monthParam);
  const monthStr = formatMonthParam(year, month0);

  if (!properties || properties.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-ink-muted text-xs tracking-wide">AVAILABILITY</p>
          <h1 className="text-2xl font-semibold mt-1">Calendar</h1>
        </div>
        <div className="card p-10 text-center text-sm text-ink-secondary">
          No active properties yet.
        </div>
      </div>
    );
  }

  const days = getMonthGrid(year, month0)
    .filter((c) => c.date !== null)
    .map((c) => c.date as string);
  const windowStart = days[0];
  const windowEnd = days[days.length - 1];
  const dayIdx = new Map(days.map((d, i) => [d, i]));
  const today = todayISO();

  const propertyIds = properties.map((p) => p.id);

  const { data: bookingLinks } = await supabase
    .from("booking_properties")
    .select("booking_id, property_id")
    .in("property_id", propertyIds);

  const bookingIds = [...new Set((bookingLinks ?? []).map((l) => l.booking_id))];

  let bookings: {
    id: string;
    check_in: string;
    check_out: string;
    source: string;
    status: string;
    guest_name: string | null;
    client_payout: number | null;
  }[] = [];

  if (bookingIds.length > 0) {
    const { data } = await supabase
      .from("bookings")
      .select("id, check_in, check_out, source, status, guest_name, client_payout")
      .in("id", bookingIds)
      .neq("status", "cancelled")
      .lte("check_in", windowEnd)
      .gt("check_out", windowStart);
    bookings = data ?? [];
  }

  const { data: blocks } = await supabase
    .from("calendar_blocks")
    .select("id, property_id, start_date, end_date, block_type, notes")
    .in("property_id", propertyIds)
    .lte("start_date", windowEnd)
    .gte("end_date", windowStart);

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

  /** Clips an inclusive date range to the visible month. */
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
      const pos = place(b.check_in, addDaysISO(b.check_out, -1));
      if (!pos) continue;
      segments.push({
        key: `b-${b.id}`,
        kind: "booking",
        ...pos,
        lane: 0,
        color: sourceColor(b.source),
        source: b.source,
        title: b.guest_name ?? "Guest",
        dateRange: `${formatDayMonth(b.check_in)} – ${formatDayMonth(b.check_out)}`,
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
        color: booked ? "var(--color-status-booked)" : "var(--color-status-blocked)",
        source: null,
        title: bl.notes ?? (booked ? "Booked" : "Blocked"),
        dateRange: `${formatDayMonth(bl.start_date)} – ${formatDayMonth(bl.end_date)}`,
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

  const groups: CalendarGroup[] = [
    {
      clientId: clientRecord.id,
      clientName: clientRecord.name,
      rows: properties.map(buildRow),
    },
  ];

  const bookingProperties = properties.map((p) => ({
    id: p.id,
    name: p.name,
    stack_rate: Number(p.stack_rate ?? 0),
    client_id: clientRecord.id,
    client_name: clientRecord.name,
  }));

  const bookingClients = [
    {
      id: clientRecord.id,
      deal_model: clientRecord.deal_model as DealModel,
      share_percent: Number(clientRecord.share_percent),
      deduct_percent: Number(clientRecord.deduct_percent),
    },
  ];

  const { year: prevYear, month0: prevMonth0 } = addMonths(year, month0, -1);
  const { year: nextYear, month0: nextMonth0 } = addMonths(year, month0, 1);

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

      <div className="flex items-center gap-1">
        <Link
          href={`/client/calendar?month=${formatMonthParam(prevYear, prevMonth0)}`}
          aria-label="Previous month"
          className="p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
        >
          <ChevronLeft size={16} />
        </Link>
        <p className="text-sm font-medium min-w-[150px] text-center">
          {formatMonthLabel(year, month0)}
        </p>
        <Link
          href={`/client/calendar?month=${formatMonthParam(nextYear, nextMonth0)}`}
          aria-label="Next month"
          className="p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
        >
          <ChevronRight size={16} />
        </Link>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-ink-secondary flex-wrap">
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

      <CalendarBoard
        days={days}
        today={today}
        groups={groups}
        cellMin={34}
        bookingProperties={bookingProperties}
        bookingClients={bookingClients}
        createAction={createClientBookingInline}
        groupHeaders={false}
      />

      <p className="text-xs text-ink-muted">
        {properties.length} {properties.length === 1 ? "property" : "properties"}
      </p>
    </div>
  );
}
