import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Wallet, Clock, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sourceLabel } from "@/lib/block-sources";
import { formatPKR, nightsBetween } from "@/lib/payout";
import { markBookingSettled, cancelBooking } from "./actions";
import {
  getMonthGrid,
  formatMonthLabel,
  parseMonthParam,
  formatMonthParam,
  addMonths,
} from "@/lib/calendar";

export default async function BookingsPage({
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

  const { year, month0 } = parseMonthParam(monthParam);
  const grid = getMonthGrid(year, month0);
  const visibleDates = grid.filter((c) => c.date !== null).map((c) => c.date as string);
  const monthStart = visibleDates[0];
  const monthEnd = visibleDates[visibleDates.length - 1];

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, guest_name, check_in, check_out, source, status, sale_price, net_sale, hostello_share, client_payout, settled, clients(name), booking_properties(properties(name))"
    )
    .neq("status", "cancelled")
    .lte("check_in", monthEnd)
    .gte("check_out", monthStart)
    .order("check_in");

  const totals = (bookings ?? []).reduce(
    (acc, b) => {
      acc.gross += Number(b.sale_price ?? 0);
      acc.clientPayout += Number(b.client_payout ?? 0);
      if (b.settled) {
        acc.received += Number(b.hostello_share ?? 0);
      } else {
        acc.awaiting += Number(b.hostello_share ?? 0);
      }
      return acc;
    },
    { gross: 0, clientPayout: 0, received: 0, awaiting: 0 }
  );

  const { year: prevYear, month0: prevMonth0 } = addMonths(year, month0, -1);
  const { year: nextYear, month0: nextMonth0 } = addMonths(year, month0, 1);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-ink-muted text-xs tracking-wide">FINANCE</p>
        <h1 className="text-2xl font-semibold mt-1">Bookings &amp; Payouts</h1>
      </div>

      <div className="card p-4 flex items-center justify-between">
        <Link
          href={`/admin/bookings?month=${formatMonthParam(prevYear, prevMonth0)}`}
          className="p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
        >
          <ChevronLeft size={16} />
        </Link>
        <p className="text-sm font-medium">{formatMonthLabel(year, month0)}</p>
        <Link
          href={`/admin/bookings?month=${formatMonthParam(nextYear, nextMonth0)}`}
          className="p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
        >
          <ChevronRight size={16} />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        <div className="card p-6">
          <p className="text-ink-muted text-xs">Gross revenue</p>
          <p className="text-xl font-semibold mt-2 text-ink-primary">{formatPKR(totals.gross)}</p>
        </div>
        <div className="card p-6">
          <p className="text-ink-muted text-xs">Client payouts</p>
          <p className="text-xl font-semibold mt-2 text-ink-primary">{formatPKR(totals.clientPayout)}</p>
        </div>
        <div className="card p-6">
          <p className="text-ink-muted text-xs flex items-center gap-1">
            <Clock size={12} /> Awaiting payout
          </p>
          <p className="text-xl font-semibold mt-2 text-status-pending">{formatPKR(totals.awaiting)}</p>
        </div>
        <div className="card p-6 border border-hostello-gold/30">
          <p className="text-ink-muted text-xs flex items-center gap-1">
            <CheckCircle2 size={12} /> Received (cash in hand)
          </p>
          <p className="text-xl font-semibold mt-2 text-financial">{formatPKR(totals.received)}</p>
        </div>
      </div>

      {(!bookings || bookings.length === 0) && (
        <div className="card p-10 text-center text-sm text-ink-secondary">
          No bookings recorded in {formatMonthLabel(year, month0)}.
          <div className="mt-3">
            <Link href="/admin/clients" className="text-hostello-gold text-sm hover:underline">
              Go to a client to add one →
            </Link>
          </div>
        </div>
      )}

      {bookings && bookings.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-ink-muted text-xs border-b border-border-hairline">
                <th className="px-4 py-3 font-normal">Client / units</th>
                <th className="px-4 py-3 font-normal">Dates</th>
                <th className="px-4 py-3 font-normal">Source</th>
                <th className="px-4 py-3 font-normal text-right">Hostello</th>
                <th className="px-4 py-3 font-normal text-right">Client</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const clientData = b.clients as unknown as { name: string } | null;
                const unitNames = (b.booking_properties as unknown as { properties: { name: string } | null }[])
                  ?.map((bp) => bp.properties?.name)
                  .filter(Boolean)
                  .join(", ");
                const nights = nightsBetween(b.check_in, b.check_out);
                return (
                  <tr key={b.id} className="border-b border-border-hairline last:border-0">
                    <td className="px-4 py-3">
                      <p className="text-ink-primary">{clientData?.name ?? "—"}</p>
                      <p className="text-xs text-ink-secondary">{unitNames || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">
                      {b.check_in} → {b.check_out}
                      <span className="text-ink-muted"> ({nights}n)</span>
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">{sourceLabel(b.source) ?? b.source}</td>
                    <td className="px-4 py-3 text-right text-financial">{formatPKR(b.hostello_share)}</td>
                    <td className="px-4 py-3 text-right text-ink-secondary">{formatPKR(b.client_payout)}</td>
                    <td className="px-4 py-3">
                      {b.status === "tentative" ? (
                        <span className="text-xs text-status-pending">Tentative</span>
                      ) : b.settled ? (
                        <span className="text-xs text-financial">Received</span>
                      ) : (
                        <span className="text-xs text-ink-muted">Awaiting</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <form action={markBookingSettled}>
                          <input type="hidden" name="id" value={b.id} />
                          <input type="hidden" name="settled" value={(!b.settled).toString()} />
                          <button
                            type="submit"
                            className="text-xs text-ink-secondary border border-border-hairline rounded-md px-2 py-1 hover:border-border-strong transition-colors"
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
