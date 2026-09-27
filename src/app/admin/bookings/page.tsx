import Link from "next/link";
import { redirect } from "next/navigation";
import { BedDouble, CalendarPlus, Moon, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { canSeeSplit, currentProfile, currentUser } from "@/lib/auth";
import { formatPKR, nightsBetween } from "@/lib/payout";
import { formatShortStayWindow, rowShortStay } from "@/lib/short-stay";
import { cancelBooking } from "./actions";
import { BookingCard } from "@/components/shared/BookingCard";
import { MonthNav } from "@/components/shared/CalendarControls";
import { BookingFilters } from "@/components/admin/BookingFilters";
import { SubmitButton } from "@/components/shared/Busy";
import { StatementPdf } from "@/components/shared/StatementPdf";
import { statementFilename } from "@/lib/statement";
import { buildStatementReport, type ReportRow } from "@/lib/statement-report";
import { loadProfit } from "@/lib/profit";
import {
  getMonthGrid,
  formatMonthLabel,
  parseMonthParam,
  formatMonthParam,
  addMonths,
  todayISO,
} from "@/lib/calendar";

type Search = {
  month?: string;
  q?: string;
  client?: string;
  channel?: string;
  status?: string;
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
  } = await searchParams;

  const supabase = await createClient();
  const [user, profile] = await Promise.all([currentUser(), currentProfile()]);
  if (!user) redirect("/login");

  // Ops runs the same list of stays. Nothing on this page is a split any more —
  // it shows sale price, which ops needs because ops takes the payment.
  const showMoney = canSeeSplit(profile?.role);

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
    .from("bookings_v")
    .select(
      "id, guest_name, guests_count, expected_arrival, check_in, check_out, is_short_stay, short_stay_start, short_stay_end, source, status, sale_price, clients:clients_v(name), booking_properties(properties:properties_v(name))"
    );

  filter = status ? filter.eq("status", status) : filter.neq("status", "cancelled");
  if (client) filter = filter.eq("client_id", client);
  if (channel) filter = filter.eq("source", channel);

  // check_out is exclusive, so the last night is check_out - 1 and a stay
  // overlaps the month only when check_out > monthStart. With `gte` a stay
  // ending on the 1st was counted in full in both months.
  const query = searching
    ? filter.ilike("guest_name", "%" + term + "%").order("check_in", { ascending: false })
    : filter.lte("check_in", monthEnd).gt("check_out", monthStart).order("check_in");

  // A statement is one client's month, so the units it needs are only worth
  // fetching when a client is actually picked. Batched either way — the empty
  // branch resolves without a round trip.
  const wantsStatement = showMoney && Boolean(client) && !searching;

  // The statement reads its own rows on purpose. Built from the list above it
  // would inherit whatever channel or status filter happens to be on screen —
  // a document headed "September" that quietly held only the Airbnb stays, with
  // totals to match. A statement is the client's whole month or it is wrong.
  // Confirmed stays only: a tentative stay is not money made, and every other
  // income figure in the app leaves it out too.
  const statementQuery = wantsStatement
    ? supabase
        .from("bookings_v")
        .select(
          "guest_name, check_in, check_out, is_short_stay, short_stay_start, short_stay_end, source, status, sale_price, client_payout, settled, settled_date, booking_properties(property_id, properties:properties_v(name))"
        )
        .eq("client_id", client)
        .eq("status", "confirmed")
        .lte("check_in", monthEnd)
        .gt("check_out", monthStart)
        .order("check_in")
    : Promise.resolve({ data: [] as unknown[] });

  const [
    { data: bookings },
    { data: clientOptions },
    { data: clientUnits },
    { data: statementRows },
    statementProfit,
  ] = await Promise.all([
    query,
    supabase.from("clients_v").select("id, name").order("name"),
    wantsStatement
      ? supabase
          .from("properties")
          .select("id, name")
          .eq("client_id", client)
          .eq("status", "active")
          .order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    statementQuery,
    // The owner's own expenses, so the admin's copy of the statement stays the
    // same document as the one the owner pulls.
    wantsStatement ? loadProfit(supabase, client, { year, month0 }, 1) : Promise.resolve(null),
  ]);

  const rows = bookings ?? [];

  const totals = rows.reduce(
    (acc, b) => {
      if (b.status === "cancelled") return acc;
      acc.bookings += 1;
      // A short stay is stored as one night and is one night here too.
      acc.nights += nightsBetween(b.check_in, b.check_out);
      acc.guests += Number(b.guests_count ?? 0);
      return acc;
    },
    { bookings: 0, nights: 0, guests: 0 }
  );

  const { year: prevYear, month0: prevMonth0 } = addMonths(year, month0, -1);
  const { year: nextYear, month0: nextMonth0 } = addMonths(year, month0, 1);

  function monthHref(y: number, m: number) {
    const params = new URLSearchParams({ month: formatMonthParam(y, m) });
    if (client) params.set("client", client);
    if (channel) params.set("channel", channel);
    if (status) params.set("status", status);
    return `/admin/bookings?${params.toString()}`;
  }

  // The same document the owner can pull for themselves, generated by Hostello
  // so it can be sent. Deliberately identical — including carrying no
  // `hostello_share` — because two files both called "the statement" that
  // disagree is worse than one that says less.
  const statementClientName =
    (clientOptions ?? []).find((c) => c.id === client)?.name ?? "Client";
  const statementReport = wantsStatement
    ? buildStatementReport({
        rows: (statementRows ?? []) as unknown as ReportRow[],
        properties: clientUnits ?? [],
        days: visibleDates,
        clientName: statementClientName,
        monthLabel: formatMonthLabel(year, month0),
        profit: statementProfit,
      })
    : null;

  const filtered = Boolean(client || channel || status);
  const scopeLabel = searching
    ? `All dates matching “${term}”`
    : formatMonthLabel(year, month0);

  const today = todayISO();

  return (
    <div className="flex flex-col gap-5 stagger">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] md:text-3xl">Bookings</h1>
        <div className="flex items-center gap-2">
          {/* Owner only: `bookings_v` blanks `client_payout` for ops, so an ops
              statement would be a page of honest-looking zeroes. A month across
              every client is not a statement either, so the button appears
              once a client is picked. */}
          {showMoney && statementReport && (
            <StatementPdf
              report={statementReport}
              filename={statementFilename(statementClientName, formatMonthParam(year, month0)).replace(
                /\.csv$/,
                ".pdf"
              )}
              disabled={
                statementReport.rows.length === 0 &&
                !(statementReport.profit?.recorded && statementReport.profit.items.length > 0)
              }
            />
          )}
          {showMoney && !searching && !statementReport && (
            <span className="hidden md:inline text-xs text-ink-muted">Pick a client for a statement</span>
          )}
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

      <div className="flex items-center gap-3 flex-wrap justify-between">
        {searching ? (
          <p className="text-sm font-bold text-ink-secondary">{scopeLabel}</p>
        ) : (
          <MonthNav
            label={formatMonthLabel(year, month0)}
            prevHref={monthHref(prevYear, prevMonth0)}
            nextHref={monthHref(nextYear, nextMonth0)}
          />
        )}
        <div className="card p-2 rounded-2xl min-w-0 max-w-full">
          <BookingFilters
            clients={clientOptions ?? []}
            q={q}
            client={client}
            channel={channel}
            status={status}
          />
        </div>
      </div>

      {/* Three counts about the stays on screen, not a ledger. What is owed in
          either direction, and what has been settled, live on
          /admin/settlements — this page is the list of bookings. */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {[
          { label: "Stays", value: totals.bookings, icon: BedDouble, tint: "bg-violet-500/20 text-violet-300" },
          { label: "Nights", value: totals.nights, icon: Moon, tint: "bg-sky-500/15 text-sky-300" },
          { label: "Guests", value: totals.guests, icon: Users, tint: "bg-amber-300/15 text-hostello-gold-bright" },
        ].map((t) => (
          <div key={t.label} className="card p-3.5 md:p-5 flex flex-col gap-2">
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${t.tint}`}>
              <t.icon size={18} />
            </span>
            <p className="num text-xl md:text-2xl font-extrabold leading-tight">{t.value}</p>
            <p className="text-xs font-bold text-ink-muted">{t.label}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="card p-8 md:p-10 flex flex-col items-center gap-3 text-center">
          <span className="w-12 h-12 rounded-2xl gradient-brand-subtle flex items-center justify-center text-hostello-purple-light">
            <CalendarPlus size={22} />
          </span>
          <p className="text-sm text-ink-secondary">
            {searching || filtered ? "No bookings match." : `No stays in ${formatMonthLabel(year, month0)}.`}
          </p>
          <Link href="/admin/bookings/new" className="btn btn-primary">
            <Plus size={16} strokeWidth={2.5} />
            New booking
          </Link>
        </div>
      )}

      {rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
          {rows.map((b) => {
            const clientData = b.clients as unknown as { name: string } | null;
            const unitNames = (b.booking_properties as unknown as { properties: { name: string } | null }[])
              ?.map((bp) => bp.properties?.name)
              .filter(Boolean)
              .join(", ");
            const shortStay = rowShortStay(b);
            return (
              <BookingCard
                key={b.id}
                href={`/admin/bookings/${b.id}`}
                guestName={b.guest_name}
                units={unitNames ?? ""}
                subtitle={clientData?.name}
                source={b.source}
                status={b.status}
                checkIn={b.check_in}
                checkOut={b.check_out}
                hours={shortStay ? formatShortStayWindow(shortStay.start, shortStay.end) : null}
                guests={b.guests_count}
                price={formatPKR(b.sale_price)}
                today={today}
                footer={
                  b.status === "cancelled" ? undefined : (
                    // Settling is not done from a list of stays: it is done
                    // against the payment that proves it, on /admin/settlements.
                    <form action={cancelBooking}>
                      <input type="hidden" name="id" value={b.id} />
                      <SubmitButton
                        className="text-xs font-bold text-ink-muted hover:text-negative transition-colors"
                        busy="Cancelling the booking…"
                      >
                        Cancel
                      </SubmitButton>
                    </form>
                  )
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
