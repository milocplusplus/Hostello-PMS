import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Lock, ArrowLeft, CalendarSync, Building2, Users, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { blockTypeColor, blockTypeLabel, sourceColor } from "@/lib/block-sources";
import { propertyTypeLabel } from "@/lib/property-types";
import { formatPKR, type DealModel, type OtaModel } from "@/lib/payout";
import { createBookingInline } from "@/app/admin/bookings/actions";
import { listUnavailable } from "@/lib/availability";
import { formatShortStayWindow, rowShortStay } from "@/lib/short-stay";
import {
  CalendarBoard,
  type CalendarRow,
  type CalendarSegment,
} from "@/components/admin/CalendarBoard";
import { CalendarOverview, shade, type OverviewClient } from "@/components/admin/CalendarOverview";
import { CalendarAgenda } from "@/components/shared/CalendarAgenda";
import { ChannelLegend, MonthNav, ViewToggle } from "@/components/shared/CalendarControls";
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
  client?: string;
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
  const user = await currentUser();
  if (!user) redirect("/login");

  // The second is the deal terms + stack rates for the quick-add modal's live
  // payout preview. Neither depends on the other.
  const [{ data: allProperties }, { data: clientTerms }] = await Promise.all([
    supabase
      .from("properties_v")
      .select("id, name, type, city, stack_rate, short_stay_stack_rate, client_id, photo_path, clients:clients_v(name)")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("clients_v")
      .select("id, deal_model, share_percent, deduct_percent, ota_model, ota_share_percent")
      .order("name"),
  ]);

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
          <p className="eyebrow">AVAILABILITY</p>
          <h1 className="text-2xl md:text-3xl font-semibold mt-1.5">Calendar</h1>
        </div>
        <div className="card p-8 md:p-10 text-center text-sm text-ink-secondary">
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
      shortStayRate: Number(p.short_stay_stack_rate ?? 0),
      clientId: p.client_id as string,
      clientName: (p.clients as unknown as { name: string } | null)?.name ?? "—",
      photo: (p.photo_path as string | null) ?? null,
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.name.localeCompare(b.name));

  // ---- Scope --------------------------------------------------------------
  // One client at a time. No scope = the portfolio overview, which is the level
  // you navigate from; a bare ?property= (older links) lands on its owner.
  const propertyOwner = options.find((p) => p.id === sp.property)?.clientId;
  const scopeId = options.some((p) => p.clientId === sp.client) ? sp.client : propertyOwner;
  const scope = scopeId
    ? { id: scopeId, name: options.find((p) => p.clientId === scopeId)!.clientName }
    : null;

  // ---- Window -------------------------------------------------------------
  const today = todayISO();
  const view = scope && (sp.view === "week" || sp.view === "agenda") ? sp.view : "month";
  // A month of 34px cells is ~1180px wide — it does not fit a phone at all. With
  // no view asked for, the phone gets the agenda and the desktop gets the board;
  // picking "month" explicitly still gets the board (scrollable) on both.
  const autoAgenda = view === "month" && !sp.view;
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

  // ---- Filters (inside a scope only) --------------------------------------
  const propertyFilter =
    scope && options.some((p) => p.id === sp.property && p.clientId === scope.id)
      ? sp.property
      : undefined;
  const channelFilter = scope ? sp.channel || undefined : undefined;
  const statusFilter =
    scope && (sp.status === "confirmed" || sp.status === "tentative") ? sp.status : undefined;
  const filtersActive = Boolean(propertyFilter || channelFilter || statusFilter);

  const visible = scope
    ? options.filter((p) => p.clientId === scope.id && (!propertyFilter || p.id === propertyFilter))
    : options;
  const propertyIds = visible.map((p) => p.id);

  // ---- Data ---------------------------------------------------------------
  // A status filter is about bookings; a block has no status, so blocks drop
  // out rather than pretending to match. A *channel* filter is different now
  // that imported dates carry the channel they came from — those are kept and
  // matched below; manual blocks still drop out. Otherwise the blocks depend
  // only on the property ids and go out with the link lookup.
  const [{ data: bookingLinks }, { data: blocks }] = await Promise.all([
    supabase
      .from("booking_properties")
      .select("booking_id, property_id")
      .in("property_id", propertyIds),
    statusFilter
      ? Promise.resolve({
          data: [] as {
            id: string;
            property_id: string;
            start_date: string;
            end_date: string;
            block_type: string;
            notes: string | null;
            source: string | null;
            feed_id: string | null;
            booking_id: string | null;
          }[],
        })
      : supabase
          .from("calendar_blocks")
          .select("id, property_id, start_date, end_date, block_type, notes, source, feed_id, booking_id")
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
    sale_price: number | null;
    is_short_stay: boolean;
    short_stay_start: string | null;
    short_stay_end: string | null;
  }[] = [];

  if (bookingIds.length > 0) {
    let query = supabase
      .from("bookings_v")
      .select(
        "id, check_in, check_out, source, status, guest_name, sale_price, is_short_stay, short_stay_start, short_stay_end"
      )
      .in("id", bookingIds)
      .neq("status", "cancelled")
      .lte("check_in", windowEnd)
      .gt("check_out", windowStart);
    if (channelFilter) query = query.eq("source", channelFilter);
    if (statusFilter) query = query.eq("status", statusFilter);
    const { data } = await query;
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

  function buildRow(p: (typeof options)[number]): CalendarRow {
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
        amount: b.sale_price ? formatPKR(b.sale_price) : null,
        tentative: b.status === "tentative",
        href: `/admin/bookings/${b.id}`,
      });
    }

    for (const bl of blocksByProperty.get(p.id) ?? []) {
      // Under a channel filter only imported dates from that channel survive.
      if (channelFilter && (!bl.feed_id || bl.source !== channelFilter)) continue;

      // A hold that has been written up is drawn once, as its booking. It comes
      // back the moment that booking is cancelled — the channel is still
      // holding the night either way.
      if (bl.booking_id && bookingById.has(bl.booking_id)) continue;

      // calendar_blocks.end_date is inclusive.
      const pos = place(bl.start_date, bl.end_date);
      if (!pos) continue;
      // Colour and word both come from block-sources, so a new block type
      // needs nothing here.

      // An imported reservation carries no guest and no price — iCal has
      // neither. This is where an admin adds them: the ordinary booking form,
      // prefilled, with the hold itself passed along so the write knows the
      // nights are its own.
      const unwritten = Boolean(bl.feed_id) && bl.block_type === "booked" && !bl.booking_id;

      segments.push({
        key: `k-${bl.id}`,
        kind: "block",
        ...pos,
        lane: 0,
        startDate: bl.start_date,
        endDate: bl.end_date,
        color: blockTypeColor(bl.block_type),
        source: bl.feed_id ? bl.source : null,
        title: unwritten
          ? `${bl.notes ?? blockTypeLabel(bl.block_type)} · add details`
          : (bl.notes ?? blockTypeLabel(bl.block_type)),
        dateRange: `${formatDayMonth(bl.start_date)} – ${formatDayMonth(bl.end_date)}`,
        hours: null,
        amount: null,
        tentative: false,
        href: unwritten
          ? `/admin/bookings/new?${new URLSearchParams({
              property: bl.property_id,
              date: bl.start_date,
              // check_out is exclusive; the block's last night is not.
              checkout: addDaysISO(bl.end_date, 1),
              source: bl.source ?? "",
              block: bl.id,
            })}`
          : bl.feed_id
            ? "/admin/calendar/feeds"
            : `/admin/calendar/block?month=${monthStr}`,
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
      photo: p.photo,
    };
  }

  const rows = visible.map(buildRow);

  const bookingProperties = options.map((p) => ({
    id: p.id,
    name: p.name,
    stack_rate: p.stackRate,
    short_stay_stack_rate: p.shortStayRate,
    client_id: p.clientId,
    client_name: p.clientName,
  }));

  const bookingClients = (clientTerms ?? []).map((c) => ({
    id: c.id,
    deal_model: c.deal_model as DealModel,
    share_percent: Number(c.share_percent),
    deduct_percent: Number(c.deduct_percent),
    ota_model: c.ota_model as OtaModel,
    ota_share_percent: Number(c.ota_share_percent),
  }));

  // The board only knows what is taken inside the month on screen; the quick-add
  // picker lets you scroll past it, so it gets the full forward-looking set.
  const unavailable = await listUnavailable(
    supabase,
    bookingProperties.map((p) => p.id)
  );

  const header = (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-[28px] md:text-3xl truncate min-w-0">{scope ? scope.name : "Calendar"}</h1>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={`/admin/calendar/block?month=${monthStr}`}
          aria-label="Block dates"
          className="btn btn-ghost h-11 w-11 md:w-auto p-0 md:px-4 rounded-2xl"
        >
          <Lock size={16} />
          <span className="hidden md:inline">Block dates</span>
        </Link>
        <Link
          href="/admin/calendar/feeds"
          aria-label="Channels"
          className="btn btn-ghost h-11 w-11 md:w-auto p-0 md:px-4 rounded-2xl"
        >
          <CalendarSync size={16} />
          <span className="hidden md:inline">Channels</span>
        </Link>
        <Link
          href="/admin/bookings/new"
          aria-label="Add booking"
          className="btn btn-primary h-11 w-11 md:w-auto p-0 md:px-4 rounded-2xl"
        >
          <Plus size={18} strokeWidth={2.5} />
          <span className="hidden md:inline">Add booking</span>
        </Link>
      </div>
    </div>
  );

  const monthNav = (
    <MonthNav
      label={rangeLabel}
      prevHref={prevHref}
      nextHref={nextHref}
      todayHref={sp.month || sp.start ? href({ month: undefined, start: undefined }) : undefined}
    />
  );

  // ---- Portfolio overview -------------------------------------------------
  if (!scope) {
    const byClient = new Map<string, OverviewClient>();
    visible.forEach((p, i) => {
      const row = rows[i];
      let entry = byClient.get(p.clientId);
      if (!entry) {
        entry = {
          id: p.clientId,
          name: p.clientName,
          properties: 0,
          occupied: new Array(days.length).fill(0),
          arrivals: 0,
          href: href({ client: p.clientId, property: undefined }),
        };
        byClient.set(p.clientId, entry);
      }
      entry.properties += 1;
      for (let d = 0; d < days.length; d++) if (row.covered[d]) entry.occupied[d] += 1;
      entry.arrivals += row.segments.filter((s) => s.kind === "booking" && !s.clippedStart).length;
    });

    const clients = [...byClient.values()];
    const capacity = visible.length * days.length;
    const nights = clients.reduce((sum, c) => sum + c.occupied.reduce((a, b) => a + b, 0), 0);
    const pct = capacity > 0 ? Math.round((nights / capacity) * 100) : 0;
    const arrivals = clients.reduce((sum, c) => sum + c.arrivals, 0);

    return (
      <div className="flex flex-col gap-5 stagger">
        {header}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          {monthNav}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { icon: Building2, value: visible.length, label: "units" },
              { icon: Users, value: clients.length, label: "clients" },
              { icon: LogIn, value: arrivals, label: "arrivals" },
            ].map((c) => (
              <span
                key={c.label}
                className="card inline-flex items-center gap-2 h-10 px-3.5 rounded-full text-xs font-bold"
              >
                <c.icon size={14} className="text-hostello-purple-light" />
                <span className="num text-ink-primary">{c.value}</span>
                <span className="text-ink-muted">{c.label}</span>
              </span>
            ))}
            <span className="pill-active inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-xs font-extrabold">
              <span className="num">{pct}%</span> booked
            </span>
          </div>
        </div>

        <CalendarOverview days={days} today={today} clients={clients} />

        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
          {[0, 0.5, 1].map((r) => (
            <span key={r} className="w-4 h-4 rounded-[5px]" style={{ background: shade(r) }} />
          ))}
          <span className="ml-1">Free → full</span>
        </div>
      </div>
    );
  }

  // ---- One client ---------------------------------------------------------
  const scopeClients = [...new Map(options.map((p) => [p.clientId, p.clientName])).entries()].map(
    ([id, name]) => ({ id, name })
  );
  const scopeProperties = options
    .filter((p) => p.clientId === scope.id)
    .map((p) => ({ id: p.id, name: p.name }));

  const legend: { label: string; color: string }[] = [
    { label: "Airbnb", color: sourceColor("airbnb") },
    { label: "Booking.com", color: sourceColor("booking_com") },
    { label: "Hostello Direct", color: sourceColor("hostello") },
    { label: "Client (self-sourced)", color: sourceColor("client") },
    { label: "Blocked", color: blockTypeColor("blocked") },
    { label: "Maintenance", color: blockTypeColor("maintenance") },
  ];

  return (
    <div className="flex flex-col gap-5 stagger">
      <Link
        href={href({ client: undefined, property: undefined, view: undefined, start: undefined })}
        className="group flex items-center gap-1.5 text-xs text-ink-muted hover:text-hostello-purple-light transition-colors w-fit"
      >
        <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" />
        All clients
      </Link>

      {header}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {monthNav}
          <ViewToggle
            view={view}
            autoAgenda={autoAgenda}
            hrefs={{
              month: href({ view: "month", start: undefined }),
              week: href({ view: "week", start: undefined }),
              agenda: href({ view: "agenda", start: undefined }),
            }}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto min-w-0">
          <CalendarFilters
            clients={scopeClients}
            client={scope.id}
            properties={scopeProperties}
            property={propertyFilter ?? ""}
            channel={channelFilter ?? ""}
            status={statusFilter ?? ""}
          />
          {filtersActive && (
            <Link
              href={href({ property: undefined, channel: undefined, status: undefined })}
              className="btn btn-ghost btn-sm"
            >
              Clear
            </Link>
          )}
        </div>
      </div>

      {view !== "agenda" && <ChannelLegend items={legend} />}

      {rows.length === 0 ? (
        <div className="card p-8 md:p-10 text-center text-sm text-ink-secondary">
          No properties match these filters.
        </div>
      ) : (
        <>
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
                createAction={createBookingInline}
                unavailable={unavailable}
              />
            </div>
          )}
        </>
      )}

    </div>
  );
}
