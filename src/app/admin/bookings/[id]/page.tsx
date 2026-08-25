import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Phone, Users, StickyNote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sourceLabel } from "@/lib/block-sources";
import { propertyTypeLabel } from "@/lib/property-types";
import { DEAL_MODELS, formatPKR, isOtaSource, nightsBetween } from "@/lib/payout";
import { formatDayMonth } from "@/lib/calendar";
import { Avatar } from "@/components/shared/Avatar";
import { StatusChip } from "@/components/shared/StatusChip";
import { ChannelBadge } from "@/components/admin/BookingActivity";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { BookingReceipts } from "@/components/shared/BookingReceipts";
import { listReceipts } from "@/lib/receipts";
import {
  markBookingSettled,
  cancelBooking,
  uploadBookingReceipt,
  deleteBookingReceipt,
} from "../actions";

function Line({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border-hairline last:border-0">
      <span className="text-xs text-ink-secondary">{label}</span>
      <span className={`text-sm ${gold ? "text-financial" : "text-ink-primary"}`}>{value}</span>
    </div>
  );
}

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ receipt_error?: string }>;
}) {
  const { id } = await params;
  const { receipt_error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, guest_name, guest_phone, guests_count, check_in, check_out, source, status, sale_price, advance_received, deal_model_snapshot, share_percent_snapshot, deduct_percent_snapshot, ota_model_snapshot, ota_share_percent_snapshot, stack_rate_snapshot, net_sale, hostello_share, client_payout, settled, settled_date, notes, created_at, client_id, clients(name), booking_properties(properties(id, name, city, type))"
    )
    .eq("id", id)
    .maybeSingle();

  if (!booking) notFound();

  const receipts = await listReceipts(supabase, booking.id);

  const client = booking.clients as unknown as { name: string } | null;
  const units = ((booking.booking_properties as unknown as {
    properties: { id: string; name: string; city: string | null; type: string | null } | null;
  }[]) ?? [])
    .map((bp) => bp.properties)
    .filter((p): p is { id: string; name: string; city: string | null; type: string | null } => Boolean(p));

  const nights = nightsBetween(booking.check_in, booking.check_out);
  const gross = Number(booking.sale_price ?? 0);
  const deductPct = Number(booking.deduct_percent_snapshot ?? 0);
  const deduction = gross - Number(booking.net_sale ?? gross);
  // OTA bookings settle on their own per-client terms, not the deal model.
  const otaSnapshot = isOtaSource(booking.source) ? booking.ota_model_snapshot : null;
  const dealLabel = otaSnapshot
    ? otaSnapshot === "none"
      ? "Airbnb / Booking.com — Hostello earns nothing"
      : otaSnapshot === "percent"
        ? `Airbnb / Booking.com — ${booking.ota_share_percent_snapshot}% share`
        : "Airbnb / Booking.com — stack rate"
    : (DEAL_MODELS.find((d) => d.value === booking.deal_model_snapshot)?.label ??
      booking.deal_model_snapshot ??
      "—");

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      <div>
        <Link href="/admin/calendar" className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Calendar
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap mt-2">
          <div className="flex items-center gap-3">
            <Avatar name={booking.guest_name} size={44} />
            <div>
              <h1 className="text-xl font-semibold">{booking.guest_name ?? "Guest"}</h1>
              <p className="text-xs text-ink-secondary mt-1 flex items-center gap-1.5">
                <ChannelBadge source={booking.source} />
                {sourceLabel(booking.source) ?? booking.source}
                <span className="text-ink-muted">·</span>
                {client?.name ?? "—"}
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
              <Link
                key={u.id}
                href={`/admin/clients/${booking.client_id}/properties/${u.id}/edit`}
                className="text-xs text-ink-secondary hover:text-ink-primary transition-colors"
              >
                {u.name}
                <span className="text-ink-muted">
                  {[propertyTypeLabel(u.type), u.city].filter(Boolean).length > 0 &&
                    ` — ${[propertyTypeLabel(u.type), u.city].filter(Boolean).join(" · ")}`}
                </span>
              </Link>
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
          <p className="text-[11px] text-ink-muted mb-2">{dealLabel} — terms as of booking</p>

          <Line label="Sale price" value={formatPKR(gross)} />
          {deduction > 0 && (
            <Line label={`Deduction (${deductPct}%)`} value={`− ${formatPKR(deduction)}`} />
          )}
          <Line label="Net sale" value={formatPKR(booking.net_sale)} />
          <Line label="Hostello share" value={formatPKR(booking.hostello_share)} gold />
          <Line label="Client payout" value={formatPKR(booking.client_payout)} />
          {Number(booking.advance_received ?? 0) > 0 && (
            <Line label="Advance received" value={formatPKR(booking.advance_received)} />
          )}
          <Line
            label="Settlement"
            value={
              booking.settled
                ? `Received${booking.settled_date ? ` · ${formatDayMonth(booking.settled_date)}` : ""}`
                : "Awaiting"
            }
          />
        </div>
      </div>

      <BookingReceipts
        bookingId={booking.id}
        receipts={receipts}
        uploadAction={uploadBookingReceipt}
        deleteAction={deleteBookingReceipt}
        error={receipt_error}
      />

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
          <form action={markBookingSettled}>
            <input type="hidden" name="id" value={booking.id} />
            <input type="hidden" name="settled" value={(!booking.settled).toString()} />
            <button
              type="submit"
              className="text-xs text-ink-secondary border border-border-hairline rounded-md px-3 py-1.5 hover:border-border-strong transition-colors"
            >
              {booking.settled ? "Mark unpaid" : "Mark received"}
            </button>
          </form>
          <form action={cancelBooking}>
            <input type="hidden" name="id" value={booking.id} />
            <ConfirmDeleteButton
              confirmText="Cancel this booking? The dates free up and the client is notified."
              label="Cancel booking"
              className="text-xs text-ink-muted hover:text-status-booked transition-colors px-1"
            />
          </form>
          <Link
            href="/admin/bookings"
            className="ml-auto text-xs text-ink-muted hover:text-ink-secondary transition-colors"
          >
            All bookings →
          </Link>
        </div>
      )}
    </div>
  );
}
