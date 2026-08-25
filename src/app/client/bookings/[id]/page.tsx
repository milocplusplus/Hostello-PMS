import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Phone, Users, StickyNote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { sourceLabel } from "@/lib/block-sources";
import { propertyTypeLabel } from "@/lib/property-types";
import { formatPKR, nightsBetween } from "@/lib/payout";
import { formatDayMonth } from "@/lib/calendar";
import { Avatar } from "@/components/shared/Avatar";
import { StatusChip } from "@/components/shared/StatusChip";
import { ChannelBadge } from "@/components/admin/BookingActivity";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { BookingReceipts } from "@/components/shared/BookingReceipts";
import { listReceipts } from "@/lib/receipts";
import { cancelClientBooking } from "../actions";

function Line({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border-hairline last:border-0">
      <span className="text-xs text-ink-secondary">{label}</span>
      <span className={`text-sm ${gold ? "text-financial" : "text-ink-primary"}`}>{value}</span>
    </div>
  );
}

export default async function ClientBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, guest_name, guest_phone, guests_count, check_in, check_out, source, status, sale_price, advance_received, net_sale, client_payout, settled, settled_date, notes, client_id, booking_properties(properties(id, name, city, type))"
    )
    .eq("id", id)
    .eq("client_id", clientRecord.id)
    .maybeSingle();

  if (!booking) notFound();

  const receipts = await listReceipts(supabase, booking.id);

  const units =((booking.booking_properties as unknown as {
    properties: { id: string; name: string; city: string | null; type: string | null } | null;
  }[]) ?? [])
    .map((bp) => bp.properties)
    .filter((p): p is { id: string; name: string; city: string | null; type: string | null } => Boolean(p));

  const nights = nightsBetween(booking.check_in, booking.check_out);
  const gross = Number(booking.sale_price ?? 0);
  const deduction = gross - Number(booking.net_sale ?? gross);

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      <div>
        <Link href="/client/bookings" className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Bookings
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap mt-2">
          <div className="flex items-center gap-3">
            <Avatar name={booking.guest_name} size={44} />
            <div>
              <h1 className="text-xl font-semibold">{booking.guest_name ?? "Guest"}</h1>
              <p className="text-xs text-ink-secondary mt-1 flex items-center gap-1.5">
                <ChannelBadge source={booking.source} />
                {sourceLabel(booking.source) ?? booking.source}
              </p>
            </div>
          </div>
          <StatusChip status={booking.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-secondary mb-3">Stay</h2>

          <div className="flex items-center gap-2 text-sm text-ink-primary">
            <CalendarDays size={14} className="text-ink-muted" />
            {formatDayMonth(booking.check_in)} → {formatDayMonth(booking.check_out)}
            <span className="text-ink-muted text-xs">
              ({nights} {nights === 1 ? "night" : "nights"})
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            {units.length === 0 && <p className="text-xs text-ink-muted">No units linked.</p>}
            {units.map((u) => (
              <p key={u.id} className="text-xs text-ink-secondary">
                {u.name}
                <span className="text-ink-muted">
                  {[propertyTypeLabel(u.type), u.city].filter(Boolean).length > 0 &&
                    ` — ${[propertyTypeLabel(u.type), u.city].filter(Boolean).join(" · ")}`}
                </span>
              </p>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-1.5 text-xs text-ink-secondary">
            {booking.guest_phone && (
              <span className="flex items-center gap-2">
                <Phone size={12} className="text-ink-muted" />
                {booking.guest_phone}
              </span>
            )}
            {booking.guests_count != null && (
              <span className="flex items-center gap-2">
                <Users size={12} className="text-ink-muted" />
                {booking.guests_count} {booking.guests_count === 1 ? "guest" : "guests"}
              </span>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-secondary mb-1">Payout</h2>
          <p className="text-[11px] text-ink-muted mb-2">Terms as agreed when this booking was made</p>

          <Line label="Sale price" value={formatPKR(gross)} />
          {deduction > 0 && <Line label="Deduction" value={`− ${formatPKR(deduction)}`} />}
          <Line label="Net sale" value={formatPKR(booking.net_sale)} />
          <Line label="Your payout" value={formatPKR(booking.client_payout)} gold />
          {Number(booking.advance_received ?? 0) > 0 && (
            <Line label="Advance received" value={formatPKR(booking.advance_received)} />
          )}
          <Line
            label="Settlement"
            value={
              booking.settled
                ? `Paid out${booking.settled_date ? ` · ${formatDayMonth(booking.settled_date)}` : ""}`
                : "Awaiting"
            }
          />
        </div>
      </div>

      {receipts.length > 0 && <BookingReceipts bookingId={booking.id} receipts={receipts} />}

      {booking.notes && (
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-secondary mb-2 flex items-center gap-1.5">
            <StickyNote size={13} /> Notes
          </h2>
          <p className="text-sm text-ink-secondary whitespace-pre-wrap">{booking.notes}</p>
        </div>
      )}

      {booking.status !== "cancelled" && (
        <div className="flex items-center gap-2 flex-wrap">
          <form action={cancelClientBooking}>
            <input type="hidden" name="id" value={booking.id} />
            <ConfirmDeleteButton
              confirmText="Cancel this booking? The dates free up on your calendar."
              label="Cancel booking"
              className="text-xs text-ink-muted hover:text-status-booked transition-colors px-1"
            />
          </form>
          <Link
            href="/client/calendar"
            className="ml-auto text-xs text-ink-muted hover:text-ink-secondary transition-colors"
          >
            Calendar →
          </Link>
        </div>
      )}
    </div>
  );
}
