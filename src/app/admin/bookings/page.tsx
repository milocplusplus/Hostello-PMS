import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { sourceLabel } from "@/lib/block-sources";
import { formatPKR, nightsBetween } from "@/lib/payout";
import { markBookingSettled, cancelBooking } from "./actions";
import { Avatar } from "@/components/shared/Avatar";
import { ChannelBadge } from "@/components/admin/BookingActivity";
import { BookingFilters } from "@/components/admin/BookingFilters";
import {
  getMonthGrid,
  formatMonthLabel,
  parseMonthParam,
  formatMonthParam,
  addMonths,
  formatDayMonth,
} from "@/lib/calendar";

type Search = {
  month?: string;
  q?: string;
  client?: string;
  channel?: string;
  status?: string;
  settle?: string;
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const {
    month: monthParam,
    q = "",
    client = "",
    channel = "",
    status = "",
    settle = "",
  } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const { year, month0 } = parseMonthParam(monthParam);
  const grid = getMonthGrid(year, month0);
  const visibleDates = grid.filter((c) => c.date !== null).map((c) => c.date as string);
  const monthStart = visibleDates[0];
  const monthEnd = visibleDates[visibleDates.length - 1];

  // A guest-name search looks across all dates — otherwise whichever month you
  // happen to be sitting on would silently hide the match.
  const term = q.trim();
  const searching = term.length > 0;

  let filter = supabase
    .from("bookings")
    .select(
      "id, guest_name, check_in, check_out, source, status, sale_price, net_sale, hostello_share, client_payout, settled, clients(name), booking_properties(properties(name))"
    );

  filter = status ? filter.eq("status", status) : filter.neq("status", "cancelled");
  if (client) filter = filter.eq("client_id", client);
  if (channel) filter = filter.eq("source", channel);
  if (settle) filter = filter.eq("settled", settle === "received");

  const query = searching
    ? filter.ilike("guest_name", "%" + term + "%").order("check_in", { ascending: false })
    : filter.lte("check_in", monthEnd).gte("check_out", monthStart).order("check_in");

  const [{ data: bookings }, { data: clientOptions }] = await Promise.all([
    query,
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const rows = bookings ?? [];

  const totals = rows.reduce(
    (acc, b) => {
      if (b.status === "cancelled") return acc;
      acc.gross += Number(b.sale_price ?? 0);
      acc.clientPayout += Number(b.client_payout ?? 0);
      if (b.settled) acc.received += Number(b.hostello_share ?? 0);
      else acc.awaiting += Number(b.hostello_share ?? 0);
      return acc;
    },
    { gross: 0, clientPayout: 0, received: 0, awaiting: 0 }
  );

  const { year: prevYear, month0: prevMonth0 } = addMonths(year, month0, -1);
  const { year: nextYear, month0: nextMonth0 } = addMonths(year, month0, 1);

  function monthHref(y: number, m: number) {
    const params = new URLSearchParams({ month: formatMonthParam(y, m) });
    if (client) params.set("client", client);
    if (channel) params.set("channel", channel);
    if (status) params.set("status", status);
    if (settle) params.set("settle", settle);
    return `/admin/bookings?${params.toString()}`;
  }

  const filtered = Boolean(client || channel || status || settle);
  const scopeLabel = searching
    ? `All dates matching “${term}”`
    : formatMonthLabel(year, month0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-ink-muted text-xs tracking-wide">FINANCE</p>
        <h1 className="text-2xl font-semibold mt-1">Bookings &amp; Payouts</h1>
      </div>

      <div className="card p-3 flex items-center gap-3 flex-wrap justify-between">
        <BookingFilters
          clients={clientOptions ?? []}
          q={q}
          client={client}
          channel={channel}
          status={status}
          settle={settle}
        />
        {!searching && (
          <div className="flex items-center gap-1 shrink-0">
            <Link
              href={monthHref(prevYear, prevMonth0)}
              aria-label="Previous month"
              className="p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
            >
              <ChevronLeft size={16} />
            </Link>
            <p className="text-sm font-medium px-1">{formatMonthLabel(year, month0)}</p>
            <Link
              href={monthHref(nextYear, nextMonth0)}
              aria-label="Next month"
              className="p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        <div className="card p-4 md:p-6">
          <p className="text-ink-muted text-xs">Gross revenue</p>
          <p className="text-lg md:text-xl font-semibold mt-2 truncate text-ink-primary">{formatPKR(totals.gross)}</p>
        </div>
        <div className="card p-4 md:p-6">
          <p className="text-ink-muted text-xs">Client payouts</p>
          <p className="text-lg md:text-xl font-semibold mt-2 truncate text-ink-primary">{formatPKR(totals.clientPayout)}</p>
        </div>
        <div className="card p-4 md:p-6">
          <p className="text-ink-muted text-xs flex items-center gap-1">
            <Clock size={12} /> Awaiting payout
          </p>
          <p className="text-lg md:text-xl font-semibold mt-2 truncate text-status-pending">{formatPKR(totals.awaiting)}</p>
        </div>
        <div className="card p-4 md:p-6 border border-hostello-gold/30">
          <p className="text-ink-muted text-xs flex items-center gap-1">
            <CheckCircle2 size={12} /> Received (cash in hand)
          </p>
          <p className="text-lg md:text-xl font-semibold mt-2 truncate text-financial">{formatPKR(totals.received)}</p>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="card p-8 md:p-10 text-center text-sm text-ink-secondary">
          {searching || filtered
            ? "No bookings match these filters."
            : `No bookings recorded in ${formatMonthLabel(year, month0)}.`}
          <div className="mt-3">
            <Link href="/admin/bookings/new" className="text-hostello-gold text-sm hover:underline">
              Add a booking →
            </Link>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border-hairline flex items-center justify-between gap-3">
            <p className="text-xs text-ink-secondary">{scopeLabel}</p>
            <p className="text-xs text-ink-muted">
              {rows.length} {rows.length === 1 ? "booking" : "bookings"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed md:table-auto md:min-w-[720px]">
              <thead>
                <tr className="text-left text-ink-muted text-xs border-b border-border-hairline">
                  <th className="px-4 py-3 font-normal">Guest</th>
                  <th className="px-4 py-3 font-normal hidden md:table-cell">Dates</th>
                  <th className="px-4 py-3 font-normal hidden md:table-cell">Channel</th>
                  <th className="px-4 py-3 font-normal text-right hidden md:table-cell">Hostello</th>
                  <th className="px-4 py-3 font-normal text-right hidden md:table-cell">Client</th>
                  <th className="px-4 py-3 font-normal hidden md:table-cell">Status</th>
                  {/* Fixed layout on a phone: this width is what leaves the guest
                      column the rest of the card instead of overflowing it. */}
                  <th className="px-4 py-3 font-normal w-[104px] md:w-auto"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const clientData = b.clients as unknown as { name: string } | null;
                  const unitNames = (b.booking_properties as unknown as { properties: { name: string } | null }[])
                    ?.map((bp) => bp.properties?.name)
                    .filter(Boolean)
                    .join(", ");
                  const nights = nightsBetween(b.check_in, b.check_out);
                  const cancelled = b.status === "cancelled";
                  const statusNode = cancelled ? (
                    <span className="text-xs text-ink-muted">Cancelled</span>
                  ) : b.status === "tentative" ? (
                    <span className="text-xs text-status-pending">Tentative</span>
                  ) : b.settled ? (
                    <span className="text-xs text-financial">Received</span>
                  ) : (
                    <span className="text-xs text-ink-muted">Awaiting</span>
                  );
                  return (
                    <tr
                      key={b.id}
                      className={`border-b border-border-hairline last:border-0 hover:bg-surface-2 transition-colors ${
                        cancelled ? "opacity-60" : ""
                      }`}
                    >
                      <td className="p-0">
                        <Link
                          href={`/admin/bookings/${b.id}`}
                          className="flex items-center gap-3 px-4 py-3 min-w-0"
                        >
                          <Avatar name={b.guest_name} size={28} />
                          <span className="min-w-0">
                            <span className="block text-ink-primary truncate">
                              {b.guest_name ?? "Guest"}
                            </span>
                            <span className="block text-xs text-ink-secondary truncate">
                              {clientData?.name ?? "—"}
                              {unitNames ? ` · ${unitNames}` : ""}
                            </span>
                            {/* The columns that get hidden on a phone, folded into the row itself */}
                            <span className="md:hidden flex items-center gap-1.5 flex-wrap text-xs mt-1.5">
                              <ChannelBadge source={b.source} />
                              <span className="text-ink-secondary">
                                {formatDayMonth(b.check_in)} → {formatDayMonth(b.check_out)} ({nights}n)
                              </span>
                              <span className="text-financial">{formatPKR(b.hostello_share)}</span>
                              {statusNode}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-secondary whitespace-nowrap hidden md:table-cell">
                        {formatDayMonth(b.check_in)} → {formatDayMonth(b.check_out)}
                        <span className="text-ink-muted"> ({nights}n)</span>
                      </td>
                      <td className="px-4 py-3 text-ink-secondary hidden md:table-cell">
                        <span className="flex items-center gap-1.5">
                          <ChannelBadge source={b.source} />
                          {sourceLabel(b.source) ?? b.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-financial whitespace-nowrap hidden md:table-cell">
                        {formatPKR(b.hostello_share)}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-secondary whitespace-nowrap hidden md:table-cell">
                        {formatPKR(b.client_payout)}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">{statusNode}</td>
                      <td className="px-4 py-3 text-right">
                        {cancelled ? (
                          <Link
                            href={`/admin/bookings/${b.id}`}
                            className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
                          >
                            View
                          </Link>
                        ) : (
                          <div className="flex flex-col items-end gap-1.5 md:flex-row md:items-center md:justify-end md:gap-2">
                            <form action={markBookingSettled}>
                              <input type="hidden" name="id" value={b.id} />
                              <input type="hidden" name="settled" value={(!b.settled).toString()} />
                              <button
                                type="submit"
                                className="text-xs text-ink-secondary border border-border-hairline rounded-md px-2 py-1 hover:border-border-strong transition-colors whitespace-nowrap"
                              >
                                {b.settled ? "Mark unpaid" : "Mark received"}
                              </button>
                            </form>
                            <form action={cancelBooking}>
                              <input type="hidden" name="id" value={b.id} />
                              <button
                                type="submit"
                                className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                              >
                                Cancel
                              </button>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
