import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sourceColor, sourceLabel } from "@/lib/block-sources";
import { propertyTypeLabel } from "@/lib/property-types";
import { formatPKR, type DealModel } from "@/lib/payout";
import { createBookingInline } from "@/app/admin/bookings/actions";
import {
  CalendarBoard,
  type CalendarGroup,
  type CalendarRow,
  type CalendarSegment,
} from "@/components/admin/CalendarBoard";
import { CalendarFilters } from "@/components/admin/CalendarFilters";
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

type Params = {
  month?: string;
  view?: string;
  start?: string;
  property?: string;
  channel?: string;
  status?: string;
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: allProperties } = await supabase
    .from("properties")
    .select("id, name, type, city, stack_rate, client_id, clients(name)")
    .eq("status", "active")
    .order("name");

  // Deal terms + stack rates for the quick-add modal's live payout preview.
  const { data: clientTerms } = await supabase
    .from("clients")
    .select("id, deal_model, share_percent, deduct_percent")
    .order("name");

  function href(overrides: Partial<Record<keyof Params, string | undefined>>) {
    const merged = { ...sp, ...overrides };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/admin/calendar?${qs}` : "/admin/calendar";
  }

  if (!allProperties || allProperties.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-ink-muted text-xs tracking-wide">AVAILABILITY</p>
          <h1 className="text-2xl font-semibold mt-1">Calendar</h1>
        </div>
        <div className="card p-10 text-center text-sm text-ink-secondary">
          Add a property first to start managing availability.
        </div>
      </div>
    );
  }

  const options = allProperties
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type as string | null,
      city: p.city as string | null,
      stackRate: Number(p.stack_rate ?? 0),
      clientId: p.client_id as string,
      clientName: (p.clients as unknown as { name: string } | null)?.name ?? "—",
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.name.localeCompare(b.name));

  // ---- Window -------------------------------------------------------------
  const today = todayISO();
  const view = sp.view === "week" ? "week" : "month";
  const { year, month0 } = parseMonthParam(sp.month);
  const monthStr = formatMonthParam(year, month0);

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

  // ---- Filters ------------------------------------------------------------
  const propertyFilter = options.some((p) => p.id === sp.property) ? sp.property : undefined;
  const channelFilter = sp.channel || undefined;
  const statusFilter = sp.status === "confirmed" || sp.status === "tentative" ? sp.status : undefined;
  const filtersActive = Boolean(propertyFilter || channelFilter || statusFilter);

  // Every property in one board — no paging. Client groups collapse instead.
  const visible = propertyFilter ? options.filter((p) => p.id === propertyFilter) : options;
  const propertyIds = visible.map((p) => p.id);

  // ---- Data ---------------------------------------------------------------
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
    sale_price: number | null;
  }[] = [];

  if (bookingIds.length > 0) {
    let query = supabase
      .from("bookings")
      .select("id, check_in, check_out, source, status, guest_name, sale_price")
      .in("id", bookingIds)
      .neq("status", "cancelled")
      .lte("check_in", windowEnd)
      .gt("check_out", windowStart);
    if (channelFilter) query = query.eq("source", channelFilter);
    if (statusFilter) query = query.eq("status", statusFilter);
    const { data } = await query;
    bookings = data ?? [];
  }

  // A channel or status filter is about bookings; manual blocks have neither,
  // so they drop out of the view rather than pretending to match.
  const { data: blocks } = filtersActive && (channelFilter || statusFilter)
    ? { data: [] as { id: string; property_id: string; start_date: string; end_date: string; block_type: string; notes: string | null }[] }
    : await supabase
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

  function buildRow(p: (typeof options)[number]): CalendarRow {
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
        amount: b.sale_price ? formatPKR(b.sale_price) : null,
        tentative: b.status === "tentative",
        href: `/admin/bookings/${b.id}`,
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
        href: `/admin/calendar/block?month=${monthStr}`,
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

    const subtext = [propertyTypeLabel(p.type), p.city].filter(Boolean).join(" · ");

    return {
      id: p.id,
      name: p.name,
      subtext,
      lanes: Math.max(1, laneEnds.length),
      covered,
      segments,
    };
  }

  const groups: CalendarGroup[] = [];
  for (const p of visible) {
    let group = groups.find((g) => g.clientId === p.clientId);
    if (!group) {
      group = { clientId: p.clientId, clientName: p.clientName, rows: [] };
      groups.push(group);
    }
    group.rows.push(buildRow(p));
  }

  const bookingProperties = options.map((p) => ({
    id: p.id,
    name: p.name,
    stack_rate: p.stackRate,
    client_id: p.clientId,
    client_name: p.clientName,
  }));

  const bookingClients = (clientTerms ?? []).map((c) => ({
    id: c.id,
    deal_model: c.deal_model as DealModel,
    share_percent: Number(c.share_percent),
    deduct_percent: Number(c.deduct_percent),
  }));

  const legend: { label: string; color: string }[] = [
    { label: "Airbnb", color: sourceColor("airbnb") },
    { label: "Booking.com", color: sourceColor("booking_com") },
    { label: "Hostello Direct", color: sourceColor("hostello") },
    { label: "Client (self-sourced)", color: sourceColor("client") },
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
            href={`/admin/calendar/block?month=${monthStr}`}
            className="rounded-md py-2 px-3 text-xs font-medium text-ink-secondary border border-border-hairline flex items-center gap-1.5 hover:border-border-strong transition-colors"
          >
            <Lock size={13} />
            Block dates
          </Link>
          <Link
            href="/admin/bookings/new"
            className="rounded-md py-2 px-3 text-xs font-medium text-surface-0 flex items-center gap-1.5"
            style={{ backgroundColor: "var(--color-hostello-gold)" }}
          >
            <Plus size={13} strokeWidth={2.5} />
            Add booking
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
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
          </div>

          <div className="flex items-center rounded-md border border-border-hairline p-0.5">
            {(["month", "week"] as const).map((v) => (
              <Link
                key={v}
                href={href({ view: v === "month" ? undefined : v, start: undefined })}
                className={`px-3 py-1 rounded text-xs capitalize transition-colors ${
                  view === v
                    ? "bg-hostello-purple-glow text-white"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                {v}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CalendarFilters
            properties={options.map((p) => ({ id: p.id, name: p.name, clientName: p.clientName }))}
            property={propertyFilter ?? ""}
            channel={channelFilter ?? ""}
            status={statusFilter ?? ""}
          />
          {filtersActive && (
            <Link
              href={href({ property: undefined, channel: undefined, status: undefined })}
              className="text-xs text-ink-muted hover:text-ink-secondary transition-colors"
            >
              Clear
            </Link>
          )}
        </div>
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
        cellMin={view === "week" ? 130 : 34}
        bookingProperties={bookingProperties}
        bookingClients={bookingClients}
        createAction={createBookingInline}
      />

      <p className="text-xs text-ink-muted">
        {visible.length === 0
          ? "No properties match these filters."
          : `${visible.length} ${visible.length === 1 ? "property" : "properties"} across ${
              groups.length
            } ${groups.length === 1 ? "client" : "clients"}`}
        {channelFilter && ` · ${sourceLabel(channelFilter) ?? channelFilter}`}
      </p>
    </div>
  );
}
