import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment } from "react";
import { ChevronLeft, ChevronRight, Plus, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getMonthGrid,
  formatMonthLabel,
  parseMonthParam,
  formatMonthParam,
  addMonths,
  todayISO,
} from "@/lib/calendar";

const SOURCE_COLOR: Record<string, string> = {
  airbnb: "bg-[#e85d8a]",
  booking_com: "bg-[#3b82f6]",
  hostello: "bg-hostello-purple-mid",
  client: "bg-status-blocked",
};

type CellStatus = { kind: "available" } | { kind: "blocked"; label: string } | { kind: "booked"; source: string; label: string };

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
    .select("id")
    .eq("owner_user_id", user.id)
    .single();
  if (!clientRecord) redirect("/client");

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("client_id", clientRecord.id)
    .eq("status", "active")
    .order("name");

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

  const { year, month0 } = parseMonthParam(monthParam);
  const monthStr = formatMonthParam(year, month0);
  const grid = getMonthGrid(year, month0);
  const days = grid.filter((c) => c.date !== null).map((c) => c.date as string);
  const monthStart = days[0];
  const monthEnd = days[days.length - 1];

  const propertyIds = properties.map((p) => p.id);

  const { data: bookingLinks } = await supabase
    .from("booking_properties")
    .select("booking_id, property_id")
    .in("property_id", propertyIds);

  const relevantBookingIds = [...new Set((bookingLinks ?? []).map((l) => l.booking_id))];

  let bookings: {
    id: string;
    check_in: string;
    check_out: string;
    source: string;
    status: string;
    guest_name: string | null;
  }[] = [];

  if (relevantBookingIds.length > 0) {
    const { data } = await supabase
      .from("bookings")
      .select("id, check_in, check_out, source, status, guest_name")
      .in("id", relevantBookingIds)
      .neq("status", "cancelled")
      .lte("check_in", monthEnd)
      .gte("check_out", monthStart);
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

  const { data: blocks } = await supabase
    .from("calendar_blocks")
    .select("property_id, start_date, end_date, notes")
    .in("property_id", propertyIds)
    .lte("start_date", monthEnd)
    .gte("end_date", monthStart);

  const blocksByProperty = new Map<string, typeof blocks>();
  for (const b of blocks ?? []) {
    const list = blocksByProperty.get(b.property_id) ?? [];
    list.push(b);
    blocksByProperty.set(b.property_id, list);
  }

  function statusFor(propertyId: string, date: string): CellStatus {
    const propBookings = bookingsByProperty.get(propertyId) ?? [];
    const booking = propBookings.find((b) => date >= b.check_in && date < b.check_out);
    if (booking) {
      return {
        kind: "booked",
        source: booking.source,
        label: `${booking.guest_name ?? "Guest"} · ${booking.status}`,
      };
    }
    const propBlocks = blocksByProperty.get(propertyId) ?? [];
    const block = propBlocks.find((b) => date >= b.start_date && date <= b.end_date);
    if (block) {
      return { kind: "blocked", label: block.notes ?? "Blocked" };
    }
    return { kind: "available" };
  }

  const { year: prevYear, month0: prevMonth0 } = addMonths(year, month0, -1);
  const { year: nextYear, month0: nextMonth0 } = addMonths(year, month0, 1);
  const today = todayISO();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
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

      <div className="card p-4 flex items-center justify-between">
        <Link
          href={`/client/calendar?month=${formatMonthParam(prevYear, prevMonth0)}`}
          className="p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
        >
          <ChevronLeft size={16} />
        </Link>
        <p className="text-sm font-medium">{formatMonthLabel(year, month0)}</p>
        <Link
          href={`/client/calendar?month=${formatMonthParam(nextYear, nextMonth0)}`}
          className="p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
        >
          <ChevronRight size={16} />
        </Link>
      </div>

      <div className="flex items-center gap-3 text-xs text-ink-secondary flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-status-available/25" />
          Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#e85d8a]" />
          Airbnb
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#3b82f6]" />
          Booking.com
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-hostello-purple-mid" />
          Hostello
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-status-blocked" />
          Blocked
        </span>
      </div>

      <div className="card p-3 overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: "2px" }}>
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface-1 z-10 text-left text-[10px] text-ink-muted font-normal px-2 pb-2 min-w-[140px]">
                Property
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className={`text-[9px] font-normal pb-2 w-6 ${
                    d === today ? "text-hostello-gold" : "text-ink-muted"
                  }`}
                >
                  {Number(d.slice(8, 10))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Fragment>
              {properties.map((p) => (
                <tr key={p.id}>
                  <td className="sticky left-0 bg-surface-1 z-10 text-xs text-ink-primary pr-3 whitespace-nowrap">
                    {p.name}
                  </td>
                  {days.map((d) => {
                    const status = statusFor(p.id, d);
                    let cellClass = "w-6 h-6 rounded-sm ";
                    if (status.kind === "booked") {
                      cellClass += SOURCE_COLOR[status.source] ?? "bg-status-booked";
                    } else if (status.kind === "blocked") {
                      cellClass += "bg-status-blocked";
                    } else {
                      cellClass += "bg-status-available/20 hover:bg-status-available/35";
                    }

                    if (status.kind === "available") {
                      return (
                        <td key={d} className="p-0">
                          <Link
                            href={`/client/bookings/new?property=${p.id}&date=${d}`}
                            title="Add booking"
                            className={`${cellClass} block transition-colors`}
                          />
                        </td>
                      );
                    }

                    if (status.kind === "blocked") {
                      return (
                        <td key={d} className="p-0">
                          <Link
                            href={`/client/calendar/block?month=${monthStr}`}
                            title={`${status.label} — tap to unblock`}
                            className={`${cellClass} block transition-colors`}
                          />
                        </td>
                      );
                    }

                    return (
                      <td key={d} className="p-0">
                        <div title={status.label} className={cellClass} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          </tbody>
        </table>
      </div>
    </div>
  );
}
