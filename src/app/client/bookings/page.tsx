import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sourceLabel } from "@/lib/block-sources";
import { formatPKR, nightsBetween } from "@/lib/payout";
import { cancelClientBooking } from "./actions";
import { Avatar } from "@/components/shared/Avatar";
import { ChannelBadge } from "@/components/admin/BookingActivity";
import {
  getMonthGrid,
  formatMonthLabel,
  parseMonthParam,
  formatMonthParam,
  addMonths,
  formatDayMonth,
} from "@/lib/calendar";

export default async function ClientBookingsPage({
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

  const { year, month0 } = parseMonthParam(monthParam);
  const grid = getMonthGrid(year, month0);
  const visibleDates = grid.filter((c) => c.date !== null).map((c) => c.date as string);
  const monthStart = visibleDates[0];
  const monthEnd = visibleDates[visibleDates.length - 1];

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, guest_name, check_in, check_out, source, status, sale_price, client_payout, booking_properties(properties(name))"
    )
    .eq("client_id", clientRecord.id)
    .neq("status", "cancelled")
    .lte("check_in", monthEnd)
    .gte("check_out", monthStart)
    .order("check_in");

  const totals = (bookings ?? []).reduce(
    (acc, b) => {
      acc.gross += Number(b.sale_price ?? 0);
      acc.payout += Number(b.client_payout ?? 0);
      return acc;
    },
    { gross: 0, payout: 0 }
  );

  const { year: prevYear, month0: prevMonth0 } = addMonths(year, month0, -1);
  const { year: nextYear, month0: nextMonth0 } = addMonths(year, month0, 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-ink-muted text-xs tracking-wide">FINANCE</p>
          <h1 className="text-2xl font-semibold mt-1">Bookings &amp; Payouts</h1>
        </div>
        <Link
          href="/client/bookings/new"
          className="rounded-md py-2 px-3 text-xs font-medium text-surface-0 flex items-center gap-1.5"
          style={{ backgroundColor: "var(--color-hostello-gold)" }}
        >
          <Plus size={13} strokeWidth={2.5} />
          Add booking
        </Link>
      </div>

      <div className="card p-4 flex items-center justify-between">
        <Link
          href={`/client/bookings?month=${formatMonthParam(prevYear, prevMonth0)}`}
          className="p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
        >
          <ChevronLeft size={16} />
        </Link>
        <p className="text-sm font-medium">{formatMonthLabel(year, month0)}</p>
        <Link
          href={`/client/bookings?month=${formatMonthParam(nextYear, nextMonth0)}`}
          className="p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
        >
          <ChevronRight size={16} />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
        <div className="card p-6">
          <p className="text-ink-muted text-xs">Gross revenue</p>
          <p className="text-xl font-semibold mt-2 text-ink-primary">{formatPKR(totals.gross)}</p>
        </div>
        <div className="card p-6 border border-hostello-gold/30">
          <p className="text-ink-muted text-xs">Your payout</p>
          <p className="text-xl font-semibold mt-2 text-financial">{formatPKR(totals.payout)}</p>
        </div>
      </div>

      {(!bookings || bookings.length === 0) && (
        <div className="card p-10 text-center text-sm text-ink-secondary">
          No bookings recorded in {formatMonthLabel(year, month0)}.
        </div>
      )}

      {bookings && bookings.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-ink-muted text-xs border-b border-border-hairline">
                <th className="px-4 py-3 font-normal">Units</th>
                <th className="px-4 py-3 font-normal">Dates</th>
                <th className="px-4 py-3 font-normal">Source</th>
                <th className="px-4 py-3 font-normal text-right">Your payout</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const unitNames = (b.booking_properties as unknown as { properties: { name: string } | null }[])
                  ?.map((bp) => bp.properties?.name)
                  .filter(Boolean)
                  .join(", ");
                const nights = nightsBetween(b.check_in, b.check_out);
                return (
                  <tr
                    key={b.id}
                    className="border-b border-border-hairline last:border-0 hover:bg-surface-2 transition-colors"
                  >
                    <td className="p-0">
                      <Link
                        href={`/client/bookings/${b.id}`}
                        className="flex items-center gap-3 px-4 py-3 min-w-0"
                      >
                        <Avatar name={unitNames || b.guest_name} size={28} rounded="lg" />
                        <span className="min-w-0">
                          <span className="block text-ink-primary truncate">{unitNames || "—"}</span>
                          <span className="block text-xs text-ink-secondary truncate">
                            {b.guest_name ?? "Guest"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-secondary whitespace-nowrap">
                      {formatDayMonth(b.check_in)} → {formatDayMonth(b.check_out)}
                      <span className="text-ink-muted"> ({nights}n)</span>
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">
                      <span className="flex items-center gap-1.5">
                        <ChannelBadge source={b.source} />
                        {sourceLabel(b.source) ?? b.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-financial">{formatPKR(b.client_payout)}</td>
                    <td className="px-4 py-3">
                      {b.status === "tentative" ? (
                        <span className="text-xs text-status-pending">Tentative</span>
                      ) : (
                        <span className="text-xs text-status-available">Confirmed</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={cancelClientBooking}>
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                        >
                          Cancel
                        </button>
                      </form>
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
