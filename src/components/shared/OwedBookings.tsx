import type { ReactNode } from "react";
import Link from "next/link";
import { formatDayMonth } from "@/lib/calendar";
import { formatPKR } from "@/lib/payout";
import { sourceLabel } from "@/lib/block-sources";
import type { OwedBooking } from "@/lib/owed";

/**
 * The bookings behind a balance, oldest stay first — which is the order a
 * payment clears them in.
 *
 * Each line is one booking's settlement: what it owes, what has already been
 * allocated to it, and what is left. The reference is the booking itself, so
 * the row links straight to it rather than restating the stay.
 */
export function OwedBookings({
  bookings,
  hrefBase,
  empty,
  actions,
}: {
  bookings: OwedBooking[];
  /** `/admin/bookings` or `/client/bookings`. */
  hrefBase: string;
  empty: string;
  actions?: (booking: OwedBooking) => ReactNode;
}) {
  if (bookings.length === 0) {
    return <p className="text-xs text-ink-muted px-5 py-6">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm md:min-w-[560px]">
        <thead>
          <tr className="text-left text-ink-muted text-xs border-b border-border-hairline">
            <th className="px-4 md:px-5 py-2.5 font-normal">Booking</th>
            <th className="px-4 py-2.5 font-normal hidden sm:table-cell">Channel</th>
            <th className="px-4 py-2.5 font-normal text-right">Amount</th>
            <th className="px-4 md:px-5 py-2.5 font-normal text-right">Still owed</th>
            {actions && <th className="px-4 md:px-5 py-2.5 font-normal text-right">&nbsp;</th>}
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} className="border-b border-border-hairline last:border-0">
              <td className="px-4 md:px-5 py-3">
                <Link href={`${hrefBase}/${b.id}`} className="block min-w-0">
                  <span className="block text-ink-primary truncate">{b.guestName ?? "Guest"}</span>
                  <span className="block text-xs text-ink-secondary truncate">
                    {b.unitNames.join(", ") || "—"} · {formatDayMonth(b.checkIn)} →{" "}
                    {formatDayMonth(b.checkOut)}
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3 text-ink-secondary text-xs hidden sm:table-cell">
                {sourceLabel(b.source) ?? b.source}
              </td>
              <td className="px-4 py-3 text-right text-ink-secondary whitespace-nowrap">
                {formatPKR(b.share)}
                {b.paid > 0 && (
                  <span className="block text-[11px] text-status-pending">
                    {formatPKR(b.paid)} paid
                  </span>
                )}
              </td>
              <td className="px-4 md:px-5 py-3 text-right text-financial whitespace-nowrap">
                {formatPKR(b.outstanding)}
              </td>
              {actions && (
                <td className="px-4 md:px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">{actions(b)}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
