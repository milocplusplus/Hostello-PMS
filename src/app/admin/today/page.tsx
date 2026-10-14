import { blockTypeLabel } from "@/lib/block-sources";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, LogIn, LogOut, BedDouble, Clock, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hhmm, rowShortStay, departureDate } from "@/lib/short-stay";
import { canSeeSplit, currentProfile, currentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import { todayISO, formatFullDate, formatDayMonth } from "@/lib/calendar";
import { TodayBoard, type TodayStay } from "@/components/shared/TodayBoard";
import { markStayProgress, recordBalancePayment } from "@/app/admin/bookings/actions";
import { PaymentError, RecordPaymentForm } from "@/components/shared/BalancePayments";
import { Avatar } from "@/components/shared/Avatar";
import { EmptyState, PageHeader } from "@/components/shared/PageHeader";
import { ReviewRequests } from "@/components/admin/ReviewRequests";
import { loadReviewRequests } from "@/lib/review-requests";
import { houseStyle, loadSettings } from "@/lib/settings";

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
  expected_arrival: string | null;
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
    expectedArrival: b.expected_arrival ? hhmm(b.expected_arrival) : null,
  };
}

export default async function AdminTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ pay_error?: string; pay_for?: string }>;
}) {
  const { pay_error, pay_for } = await searchParams;
  const supabase = await createClient();
  const [user, profile] = await Promise.all([currentUser(), currentProfile()]);
  if (!user) redirect("/login");
  const isAdmin = canSeeSplit(profile?.role);

  const today = todayISO();
  const fields =
    "id, guest_name, guest_phone, guests_count, check_in, check_out, source, status, sale_price, advance_received, checked_in_at, checked_out_at, is_short_stay, short_stay_start, short_stay_end, expected_arrival, clients:clients_v(name), booking_properties(properties:properties_v(name))";

  const [{ data: stays }, { data: pending }, { data: blocks }, reviews, settings] = await Promise.all([
    // check_out is exclusive, so a stay covering tonight has check_out > today —
    // but today's departures (check_out = today) belong on this sheet too.
    supabase
      .from("bookings_v")
      .select(fields)
      .neq("status", "cancelled")
      .lte("check_in", today)
      .gte("check_out", today)
      .order("check_in"),
    supabase
      .from("bookings_v")
      .select("id, guest_name, check_in, check_out, balance_due, balance_pending, clients:clients_v(name)")
      .eq("status", "confirmed")
      .gt("balance_due", 0)
      .order("check_in"),
    supabase
      .from("calendar_blocks")
      .select("id, start_date, end_date, block_type, notes, properties:properties_v(name, clients:clients_v(name))")
      .lte("start_date", today)
      .gte("end_date", today),
    loadReviewRequests(supabase, today),
    loadSettings(),
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

  // Same definition as the dashboard's "Balance due" tile: a confirmed stay the
  // guest has not finished paying for. Today's arrivals first — that is who is
  // about to hand money over at the door.
  const outstanding = ((pending ?? []) as unknown as {
    id: string;
    guest_name: string | null;
    check_in: string;
    check_out: string;
    balance_due: number | null;
    balance_pending: number | null;
    clients: unknown;
  }[]).sort((a, b) => Number(b.check_in === today) - Number(a.check_in === today));

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
    <div className="flex flex-col gap-4 stagger">
      <PageHeader title="Today" sub={formatFullDate(today)} />

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

      <ReviewRequests toAsk={reviews.toAsk} waiting={reviews.waiting} today={today} house={houseStyle(settings)} />

      <section className="card overflow-hidden flex flex-col">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-hairline">
          <span
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-status-pending) 20%, transparent)" }}
          >
            <Clock size={14} style={{ color: "var(--color-status-pending)" }} />
          </span>
          <h2 className="text-sm font-medium flex-1">Guest balances</h2>
          {isAdmin && (
            <Link
              href="/admin/settlements#collect"
              className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
            >
              Money →
            </Link>
          )}
        </div>
        {outstanding.length === 0 ? (
          <div className="p-3">
            <EmptyState inset icon={CircleCheck} title="Every confirmed guest has paid in full." />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border-hairline)]">
            {outstanding.slice(0, 8).map((b) => {
              const due = Number(b.balance_due ?? 0);
              const waiting = Number(b.balance_pending ?? 0);
              return (
                <li key={b.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center gap-3">
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
                    <span className="text-xs text-status-pending shrink-0 text-right">
                      {formatPKR(due)} to pay
                      {waiting > 0 && (
                        <span className="block text-[11px] text-ink-muted">{formatPKR(waiting)} awaiting approval</span>
                      )}
                    </span>
                  </div>
                  <RecordPaymentForm
                    bookingId={b.id}
                    left={due - waiting}
                    back="/admin/today"
                    action={recordBalancePayment}
                    label="Record payment"
                    open={pay_for === b.id}
                    note={isAdmin ? "It counts as soon as you save it." : "It counts once the admin approves it."}
                  />
                  {pay_for === b.id && <PaymentError error={pay_error} />}
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
                    {blockTypeLabel(bl.block_type)}
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
