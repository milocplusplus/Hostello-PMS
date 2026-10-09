import { EmptyState } from "@/components/shared/PageHeader";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus, Moon, Plus, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import { firstUnitPhoto } from "@/lib/property-photos";
import { formatShortStayWindow, rowShortStay } from "@/lib/short-stay";
import { cancelClientBooking } from "./actions";
import { BookingCard } from "@/components/shared/BookingCard";
import { MonthNav } from "@/components/shared/CalendarControls";
import { InfoSheet } from "@/components/shared/InfoSheet";
import { SubmitButton } from "@/components/shared/Busy";
import { StatementExport } from "@/components/shared/StatementExport";
import { buildStatementCsv, nightsInMonth, statementFilename, type StatementRow } from "@/lib/statement";
import { StatementPdf } from "@/components/shared/StatementPdf";
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
import { businessContact, loadSettings } from "@/lib/settings";

export default async function ClientBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const { year, month0 } = parseMonthParam(monthParam);
  const grid = getMonthGrid(year, month0);
  const visibleDates = grid.filter((c) => c.date !== null).map((c) => c.date as string);
  const monthStart = visibleDates[0];
  const monthEnd = visibleDates[visibleDates.length - 1];

  // Independent of each other, so one round trip rather than two — the
  // database is in Sydney and sequential calls are what makes a page feel slow.
  const [{ data: bookings }, { data: properties }, profit] = await Promise.all([
    supabase
      .from("bookings_v")
      .select(
        // client_payout / settled / settled_date and the property ids are for
        // the statement exports only — the table below shows none of them.
        "id, guest_name, check_in, check_out, is_short_stay, short_stay_start, short_stay_end, source, status, sale_price, client_payout, due_to_client, settled, settled_date, guests_count, expected_arrival, booking_properties(property_id, properties(name, photo_path))"
      )
      .eq("client_id", clientRecord.id)
      .neq("status", "cancelled")
      .lte("check_in", monthEnd)
      .gt("check_out", monthStart)
      .order("check_in"),
    // Active units, so the report's occupancy has a denominator and a unit that
    // sold nothing still appears at zero rather than vanishing.
    supabase
      .from("properties")
      .select("id, name")
      .eq("client_id", clientRecord.id)
      .eq("status", "active")
      .order("name"),
    // Their own expenses, for the statement's last section. It appears only
    // when this month is inside their records (`profit.recorded`).
    loadProfit(supabase, clientRecord.id, { year, month0 }, 1),
  ]);

  // Counts about the stays, not a ledger: your payout and whether it has
  // reached you live on /client/settlements, next to the payment proving it.
  // The list is every stay touching the month, tentative ones too; gross counts
  // a confirmed stay whole in the month it checks in, the rule the dashboard,
  // Stats and Profit use. A stay that began last month is listed here but
  // counted there, and a tentative one is listed but not money made. Nights
  // are the listed confirmed stays' — a tentative night is not yet booked —
  // inside the month, by the statement's own rule, so screen and file agree.
  const month = { start: monthStart, end: monthEnd };
  const totals = (bookings ?? []).reduce(
    (acc, b) => {
      if (b.status !== "confirmed") return acc;
      if (b.check_in >= monthStart) acc.gross += Number(b.sale_price ?? 0);
      acc.nights += nightsInMonth(b, month);
      return acc;
    },
    { gross: 0, nights: 0 }
  );

  // Built here rather than behind a Server Action: these rows are already in
  // memory, so the file costs nothing extra, and the page stays a plain read.
  // Confirmed stays only, as the admin's copy reads them — the list shows
  // tentative ones, but a statement is money made.
  const statementRows = (bookings ?? []).filter((b) => b.status === "confirmed");
  const monthLabel = formatMonthLabel(year, month0);
  const statementCsv = buildStatementCsv(statementRows as unknown as StatementRow[], {
    clientName: clientRecord.name,
    monthLabel,
    month,
    profit,
  });
  const statementName = statementFilename(
    clientRecord.name,
    formatMonthParam(year, month0)
  );
  const report = buildStatementReport({
    rows: statementRows as unknown as ReportRow[],
    properties: properties ?? [],
    days: visibleDates,
    clientName: clientRecord.name,
    monthLabel,
    profit,
  });
  // A month with no stays but recorded expenses still has something to report.
  const nothingToReport = statementRows.length === 0 && !(profit.recorded && profit.items.length > 0);

  const { year: prevYear, month0: prevMonth0 } = addMonths(year, month0, -1);
  const { year: nextYear, month0: nextMonth0 } = addMonths(year, month0, 1);

  const today = todayISO();

  return (
    <div className="flex flex-col gap-5 stagger">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] md:text-3xl">Bookings</h1>
        <div className="flex items-center gap-2">
          <StatementPdf
            business={businessContact(await loadSettings())}
            report={report}
            filename={statementName.replace(/\.csv$/, ".pdf")}
            disabled={nothingToReport}
          />
          <StatementExport
            csv={statementCsv}
            filename={statementName}
            disabled={nothingToReport}
          />
          <Link
            href="/client/bookings/new"
            aria-label="Add booking"
            className="btn btn-primary h-11 w-11 md:w-auto p-0 md:px-4 rounded-2xl"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span className="hidden md:inline">Add booking</span>
          </Link>
        </div>
      </div>

      <MonthNav
        label={monthLabel}
        prevHref={`/client/bookings?month=${formatMonthParam(prevYear, prevMonth0)}`}
        nextHref={`/client/bookings?month=${formatMonthParam(nextYear, nextMonth0)}`}
      />

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <div className="card-hero p-4 md:p-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Wallet size={18} />
            </span>
            <InfoSheet title="Gross" className="bg-white/20 text-white">
              <p>What guests paid for confirmed stays checking in this month.</p>
            </InfoSheet>
          </div>
          <p className="num text-xl md:text-2xl font-extrabold truncate">{formatPKR(totals.gross)}</p>
          <p className="text-xs font-bold text-white/80">Gross</p>
        </div>
        <div className="card p-4 md:p-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="w-9 h-9 rounded-xl bg-amber-300/15 text-hostello-gold-bright flex items-center justify-center">
              <Moon size={18} />
            </span>
            <InfoSheet title="Nights booked" className="bg-white/8 text-ink-secondary">
              <p>Nights of confirmed stays that fall inside this month.</p>
            </InfoSheet>
          </div>
          <p className="num text-xl md:text-2xl font-extrabold text-hostello-gold-bright">{totals.nights}</p>
          <p className="text-xs font-bold text-ink-muted">Nights</p>
        </div>
      </div>

      {(!bookings || bookings.length === 0) && (
        <EmptyState
          icon={CalendarPlus}
          title={`No stays in ${monthLabel}.`}
            action={
              <Link href="/client/bookings/new" className="btn btn-primary">
                <Plus size={16} strokeWidth={2.5} />
                New booking
              </Link>
            }
        />
      )}

      {bookings && bookings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
          {bookings.map((b) => {
            const unitNames = (b.booking_properties as unknown as { properties: { name: string } | null }[])
              ?.map((bp) => bp.properties?.name)
              .filter(Boolean)
              .join(", ");
            const shortStay = rowShortStay(b);
            return (
              <BookingCard
                key={b.id}
                href={`/client/bookings/${b.id}`}
                guestName={b.guest_name}
                units={unitNames ?? ""}
                source={b.source}
                status={b.status}
                checkIn={b.check_in}
                checkOut={b.check_out}
                hours={shortStay ? formatShortStayWindow(shortStay.start, shortStay.end) : null}
                guests={b.guests_count}
                price={formatPKR(b.sale_price)}
                photo={firstUnitPhoto(b.booking_properties)}
                today={today}
                footer={
                  <form action={cancelClientBooking}>
                    <input type="hidden" name="id" value={b.id} />
                    <SubmitButton
                      className="text-xs font-bold text-ink-muted hover:text-negative transition-colors"
                      busy="Cancelling the booking…"
                    >
                      Cancel
                    </SubmitButton>
                  </form>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
