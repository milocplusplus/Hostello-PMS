import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { sourceLabel } from "@/lib/block-sources";
import { formatPKR, nightsBetween } from "@/lib/payout";
import { formatShortStayWindow, rowShortStay } from "@/lib/short-stay";
import { cancelBooking } from "./actions";
import { markShareReceived } from "../payouts/actions";
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
      "id, guest_name, check_in, check_out, is_short_stay, short_stay_start, short_stay_end, source, status, sale_price, net_sale, hostello_share, client_payout, settled, share_received, clients(name), booking_properties(properties(name))"
    );

  filter = status ? filter.eq("status", status) : filter.neq("status", "cancelled");
  if (client) filter = filter.eq("client_id", client);
  if (channel) filter = filter.eq("source", channel);
  if (settle) filter = filter.eq("share_received", settle === "received");

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
      if (b.share_received) acc.received += Number(b.hostello_share ?? 0);
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
        <p className="eyebrow">Finance</p>
        <h1 className="text-2xl md:text-3xl font-semibold mt-1.5">Bookings &amp; Payouts</h1>
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
          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-surface-2/60 border border-border-hairline shrink-0">
            <Link
              href={monthHref(prevYear, prevMonth0)}
              aria-label="Previous month"
              className="p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-surface-3 transition-colors"
            >
              <ChevronLeft size={16} />
            </Link>
            <p className="text-sm font-medium px-2 min-w-[110px] text-center">
              {formatMonthLabel(year, month0)}
            </p>
            <Link
              href={monthHref(nextYear, nextMonth0)}
              aria-label="Next month"
              className="p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-surface-3 transition-colors"
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        {/* Each tile is lit by the colour of the figure it carries, so the two
            that matter — what is owed and what is in hand — read first. */}
        {[
          {
            label: "Gross revenue",
            value: formatPKR(totals.gross),
            ink: "text-ink-primary",
            tint: "var(--color-hostello-purple-glow)",
            icon: null,
          },
          {
            label: "Client payouts",
            value: formatPKR(totals.clientPayout),
            ink: "text-ink-primary",
            tint: "var(--color-channel-booking)",
            icon: null,
          },
          {
            label: "Owed to Hostello",
            value: formatPKR(totals.awaiting),
            ink: "text-status-pending",
            tint: "var(--color-status-pending)",
            icon: <Clock size={12} />,
          },
          {
            label: "Received (cash in hand)",
            value: formatPKR(totals.received),
            ink: "text-financial",
            tint: "var(--color-hostello-gold)",
            icon: <CheckCircle2 size={12} />,
          },
        ].map((t) => (
          <div key={t.label} className="card card-hover overflow-hidden relative p-4 md:p-5">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-20 opacity-[0.14]"
              style={{ background: `radial-gradient(14rem 5rem at 12% 0%, ${t.tint}, transparent 70%)` }}
            />
            <p className="eyebrow relative flex items-center gap-1.5">
              {t.icon}
              {t.label}
            </p>
            {/* Four across, so these stay at lg/xl — at 2xl a seven-figure sum
                truncates in the narrowest column. */}
            <p className={`display num relative text-lg md:text-xl font-semibold mt-2 truncate ${t.ink}`}>
              {t.value}
            </p>
          </div>
        ))}
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
          <div className="px-4 py-3.5 border-b border-border-hairline flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-tight">{scopeLabel}</h2>
            <p className="text-xs text-ink-muted">
              <span className="num">{rows.length}</span>{" "}
              {rows.length === 1 ? "booking" : "bookings"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm table-fixed md:table-auto md:min-w-[720px]">
              <thead>
                <tr className="text-left border-b border-border-hairline">
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
                  const shortStay = rowShortStay(b);
                  const cancelled = b.status === "cancelled";
                  // Settlement state is the column people scan; a dot-pill reads
                  // at a glance where four differently-coloured words did not.
                  const pill = (label: string, tone: string, dot: string) => (
                    <span
                      className={`inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full pl-1.5 pr-2.5 py-1 border whitespace-nowrap ${tone}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                      {label}
                    </span>
                  );
                  const statusNode = cancelled
                    ? pill("Cancelled", "text-ink-muted border-border-hairline bg-surface-3/60", "bg-ink-muted")
                    : b.status === "tentative"
                      ? pill(
                          "Tentative",
                          "text-status-pending border-status-pending/40 bg-status-pending/10",
                          "bg-status-pending"
                        )
                      : b.share_received
                        ? pill(
                            "Received",
                            "text-hostello-gold border-hostello-gold/40 bg-hostello-gold/10",
                            "bg-hostello-gold"
                          )
                        : pill(
                            "Awaiting",
                            "text-ink-secondary border-border-hairline bg-surface-3/60",
                            "bg-ink-muted"
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
                                {shortStay
                                  ? `${formatDayMonth(b.check_in)} · ${formatShortStayWindow(
                                      shortStay.start,
                                      shortStay.end
                                    )}`
                                  : `${formatDayMonth(b.check_in)} → ${formatDayMonth(
                                      b.check_out
                                    )} (${nights}n)`}
                              </span>
                              <span className="text-financial">{formatPKR(b.hostello_share)}</span>
                              {statusNode}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-secondary whitespace-nowrap hidden md:table-cell">
                        {shortStay
                          ? formatDayMonth(b.check_in)
                          : `${formatDayMonth(b.check_in)} → ${formatDayMonth(b.check_out)}`}
                        <span className="text-ink-muted">
                          {" "}
                          {shortStay
                            ? formatShortStayWindow(shortStay.start, shortStay.end)
                            : `(${nights}n)`}
                        </span>
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
                            <form action={markShareReceived}>
                              <input type="hidden" name="id" value={b.id} />
                              <input
                                type="hidden"
                                name="received"
                                value={(!b.share_received).toString()}
                              />
                              <button type="submit" className="btn btn-ghost btn-sm">
                                {b.share_received ? "Mark unpaid" : "Mark received"}
                              </button>
                            </form>
                            <form action={cancelBooking}>
                              <input type="hidden" name="id" value={b.id} />
                              <button
                                type="submit"
                                className="text-xs text-ink-muted hover:text-negative transition-colors px-1"
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
