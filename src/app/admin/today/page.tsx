import Link from "next/link";
import { redirect } from "next/navigation";
import { LogIn, LogOut, BedDouble, Clock, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { rowShortStay, departureDate } from "@/lib/short-stay";
import { currentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import { todayISO, formatFullDate, formatDayMonth } from "@/lib/calendar";
import { TodayBoard, type TodayStay } from "@/components/shared/TodayBoard";
import { markStayProgress } from "@/app/admin/bookings/actions";
import { Avatar } from "@/components/shared/Avatar";

type Row = {
  id: string;
  guest_name: string | null;
  guest_phone: string | null;
  guests_count: number | null;
  check_in: string;
  check_out: string;
  source: string;
  status: string;
  sale_price: number | null;
  advance_received: number | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  is_short_stay: boolean;
  short_stay_start: string | null;
  short_stay_end: string | null;
  clients: unknown;
  booking_properties: unknown;
};

function unitNames(row: { booking_properties: unknown }): string {
  return ((row.booking_properties as { properties: { name: string } | null }[] | null) ?? [])
    .map((bp) => bp.properties?.name)
    .filter(Boolean)
    .join(", ");
}

function clientName(row: { clients: unknown }): string | null {
  return (row.clients as { name: string } | null)?.name ?? null;
}

function toStay(b: Row): TodayStay {
  return {
    id: b.id,
    guestName: b.guest_name,
    units: unitNames(b),
    clientName: clientName(b),
    guests: b.guests_count,
    phone: b.guest_phone,
    source: b.source,
    status: b.status,
    checkIn: b.check_in,
    checkOut: b.check_out,
    amount: b.sale_price === null ? null : Number(b.sale_price),
    href: `/admin/bookings/${b.id}`,
    checkedInAt: b.checked_in_at,
    checkedOutAt: b.checked_out_at,
    shortStay: rowShortStay(b),
  };
}

export default async function AdminTodayPage() {
  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const today = todayISO();
  const fields =
    "id, guest_name, guest_phone, guests_count, check_in, check_out, source, status, sale_price, advance_received, checked_in_at, checked_out_at, is_short_stay, short_stay_start, short_stay_end, clients(name), booking_properties(properties(name))";

  const [{ data: stays }, { data: pending }, { data: blocks }] = await Promise.all([
    // check_out is exclusive, so a stay covering tonight has check_out > today —
    // but today's departures (check_out = today) belong on this sheet too.
    supabase
      .from("bookings")
      .select(fields)
      .neq("status", "cancelled")
      .lte("check_in", today)
      .gte("check_out", today)
      .order("check_in"),
    supabase
      .from("bookings")
      .select("id, guest_name, check_in, check_out, sale_price, advance_received, clients(name)")
      .eq("status", "confirmed")
      .order("check_in"),
    supabase
      .from("calendar_blocks")
      .select("id, start_date, end_date, block_type, notes, properties(name, clients(name))")
      .lte("start_date", today)
      .gte("end_date", today),
  ]);

  const rows = (stays ?? []) as unknown as Row[];
  const arrivals = rows.filter((b) => b.check_in === today).map(toStay);
  const departures = rows
    .filter((b) => departureDate(b.check_in, b.check_out, b.is_short_stay) === today)
    .map(toStay);
  const staying = rows
    .filter((b) => b.check_in < today && b.check_out > today)
    .map(toStay);
  const inHouse = arrivals.length + staying.length;

  // Same definition as the dashboard's "Payments pending" tile — token not yet
  // covering the sale price on a confirmed booking.
  const outstanding = ((pending ?? []) as unknown as {
    id: string;
    guest_name: string | null;
    check_in: string;
    check_out: string;
    sale_price: number | null;
    advance_received: number | null;
    clients: unknown;
  }[]).filter((b) => Number(b.advance_received ?? 0) < Number(b.sale_price ?? 0));

  const blocked = (blocks ?? []) as unknown as {
    id: string;
    start_date: string;
    end_date: string;
    block_type: string;
    notes: string | null;
    properties: unknown;
  }[];

  const tiles = [
    { label: "Arriving", value: arrivals.length, icon: LogIn, tint: "var(--color-positive)" },
    {
      label: "Departing",
      value: departures.length,
      icon: LogOut,
      tint: "var(--color-hostello-purple-glow)",
    },
    { label: "In house", value: inHouse, icon: BedDouble, tint: "var(--color-hostello-gold)" },
    {
      label: "Payments pending",
      value: outstanding.length,
      icon: Clock,
      tint: "var(--color-status-pending)",
    },
  ];

  return (
    <div className="flex flex-col gap-4 animate-in">
      <div>
        <p className="text-ink-muted text-xs tracking-wide">OVERVIEW</p>
        <h1 className="text-2xl font-semibold mt-1">Today</h1>
        <p className="text-sm text-ink-secondary mt-1.5">{formatFullDate(today)}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="card p-4 flex flex-col gap-1.5">
            <span
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ backgroundColor: `color-mix(in srgb, ${t.tint} 20%, transparent)` }}
            >
              <t.icon size={15} style={{ color: t.tint }} />
            </span>
            <p className="text-2xl font-semibold leading-none mt-1">{t.value}</p>
            <p className="text-[11px] text-ink-muted">{t.label}</p>
          </div>
        ))}
      </div>

      <TodayBoard
        arrivals={arrivals}
        departures={departures}
        staying={staying}
        progressAction={markStayProgress}
      />

      <section className="card overflow-hidden flex flex-col">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-hairline">
          <span
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-status-pending) 20%, transparent)" }}
          >
            <Clock size={14} style={{ color: "var(--color-status-pending)" }} />
          </span>
          <h2 className="text-sm font-medium flex-1">Payments pending</h2>
          <Link
            href="/admin/bookings?settle=awaiting"
            className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
          >
            All payouts →
          </Link>
        </div>
        {outstanding.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-ink-muted">
            Every confirmed booking has its token in.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border-hairline)]">
            {outstanding.slice(0, 8).map((b) => {
              const due = Number(b.sale_price ?? 0) - Number(b.advance_received ?? 0);
              return (
                <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={b.guest_name} size={30} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/bookings/${b.id}`}
                      className="text-sm text-ink-primary hover:text-hostello-gold transition-colors truncate block"
                    >
                      {b.guest_name ?? "Guest"}
                    </Link>
                    <p className="text-xs text-ink-secondary truncate mt-0.5">
                      {(b.clients as { name: string } | null)?.name ?? "—"} ·{" "}
                      {formatDayMonth(b.check_in)} – {formatDayMonth(b.check_out)}
                    </p>
                  </div>
                  <span className="text-xs text-status-pending shrink-0">
                    {formatPKR(due)} due
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {blocked.length > 0 && (
        <section className="card overflow-hidden flex flex-col">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-hairline">
            <span
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-status-blocked) 25%, transparent)" }}
            >
              <Lock size={14} style={{ color: "var(--color-status-blocked)" }} />
            </span>
            <h2 className="text-sm font-medium flex-1">Blocked today</h2>
            <span className="text-xs text-ink-muted">{blocked.length}</span>
          </div>
          <ul className="divide-y divide-[var(--color-border-hairline)]">
            {blocked.map((bl) => {
              const property = bl.properties as {
                name: string;
                clients: { name: string } | null;
              } | null;
              return (
                <li key={bl.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-primary truncate">{property?.name ?? "—"}</p>
                    <p className="text-xs text-ink-secondary truncate mt-0.5">
                      {property?.clients?.name ?? "—"} · {formatDayMonth(bl.start_date)} –{" "}
                      {formatDayMonth(bl.end_date)}
                      {bl.notes ? ` · ${bl.notes}` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] text-ink-muted shrink-0 capitalize">
                    {bl.block_type}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
