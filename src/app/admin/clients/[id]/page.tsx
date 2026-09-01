import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus, Mail, Phone, Pencil, Trash2, CalendarDays, ReceiptText, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import {
  deleteClientRecord,
  deletePropertyRecord,
  createLoginForClient,
  setClientPassword,
} from "../actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { Avatar } from "@/components/shared/Avatar";
import { ChannelBadge } from "@/components/admin/BookingActivity";
import { secondaryButton, errorBanner, noticeBanner, fieldLabel, fieldInput, primaryButton, primaryButtonStyle } from "@/lib/form-styles";
import { PROPERTY_TYPES } from "@/lib/property-types";
import { DEAL_MODELS, formatPKR, nightsBetween } from "@/lib/payout";
import { formatDayMonth, todayISO } from "@/lib/calendar";

const STATUS_COLOR: Record<string, string> = {
  active: "bg-status-available",
  inactive: "bg-status-blocked",
};

function typeLabel(value: string) {
  return PROPERTY_TYPES.find((t) => t.value === value)?.label ?? value;
}

function dealModelLabel(value: string) {
  return DEAL_MODELS.find((m) => m.value === value)?.label ?? value;
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const supabase = await createClient();

  const user = await currentUser();
  if (!user) redirect("/login");

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name, contact_email, contact_phone, deal_model, monthly_fee, share_percent, deduct_percent, ota_model, ota_share_percent")
    .eq("id", id)
    .single();

  if (!clientRecord) notFound();

  const { data: loginEmail } = await supabase.rpc("get_client_login_email", {
    p_client_id: id,
  });

  const today = todayISO();

  const [{ data: properties }, { data: recentBookings }, { data: openBookings }] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, name, location, city, province, type, status")
        .eq("client_id", id)
        .order("name"),
      supabase
        .from("bookings")
        .select(
          "id, guest_name, check_in, check_out, source, status, hostello_share, client_payout, share_received, booking_properties(properties(name))"
        )
        .eq("client_id", id)
        .neq("status", "cancelled")
        .order("check_in", { ascending: false })
        .limit(6),
      // Only open stays — a bounded set, so the "awaiting" figure is a real total.
      supabase
        .from("bookings")
        .select("hostello_share, share_received")
        .eq("client_id", id)
        .neq("status", "cancelled")
        .gte("check_out", today),
    ]);

  const awaiting = (openBookings ?? [])
    .filter((b) => !b.share_received)
    .reduce((sum, b) => sum + Number(b.hostello_share ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/clients" className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Clients
        </Link>
      </div>

      {error && <p className={errorBanner}>{error}</p>}
      {notice && <p className={noticeBanner}>{notice}</p>}

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Avatar name={clientRecord.name} size={48} />
          <div>
            <h1 className="text-xl font-semibold">{clientRecord.name}</h1>
            <div className="flex items-center gap-3 text-ink-secondary text-sm mt-1">
              {clientRecord.contact_email && (
                <span className="flex items-center gap-1.5">
                  <Mail size={13} /> {clientRecord.contact_email}
                </span>
              )}
              {clientRecord.contact_phone && (
                <span className="flex items-center gap-1.5">
                  <Phone size={13} /> {clientRecord.contact_phone}
                </span>
              )}
              {!clientRecord.contact_email && !clientRecord.contact_phone && (
                <span>No contact info</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/admin/clients/${id}/bookings/new`}
            className="btn btn-gold btn-sm"
          >
            <ReceiptText size={13} strokeWidth={2.5} />
            Add booking
          </Link>
          <Link href={`/admin/clients/${id}/edit`} className={secondaryButton}>
            Edit client
          </Link>
          <form action={deleteClientRecord}>
            <input type="hidden" name="id" value={id} />
            <ConfirmDeleteButton
              confirmText={`Delete ${clientRecord.name}? This will also delete all of their properties. This cannot be undone.`}
              className="text-xs text-status-booked border border-status-booked/30 rounded-md px-3 py-1.5 hover:bg-status-booked/10 transition-colors"
            />
          </form>
        </div>
      </header>

      <div className="card p-4 flex items-center gap-4 md:gap-6 text-xs flex-wrap">
        <span className="text-ink-secondary">
          Deal: <span className="text-ink-primary">{dealModelLabel(clientRecord.deal_model)}</span>
        </span>
        {(clientRecord.deal_model === "percent" || clientRecord.deal_model === "fixed_percent") && (
          <span className="text-ink-secondary">
            Share: <span className="text-ink-primary">{clientRecord.share_percent}%</span>
          </span>
        )}
        {(clientRecord.deal_model === "fixed" ||
          clientRecord.deal_model === "fixed_stack" ||
          clientRecord.deal_model === "fixed_percent") && (
          <span className="text-ink-secondary">
            Retainer:{" "}
            <span className="text-ink-primary">
              Rs {Number(clientRecord.monthly_fee).toLocaleString("en-PK")}/mo
            </span>
          </span>
        )}
        <span className="text-ink-secondary">
          Airbnb / Booking.com:{" "}
          <span className="text-ink-primary">
            {clientRecord.ota_model === "none"
              ? "Hostello earns nothing"
              : clientRecord.ota_model === "percent"
                ? `${clientRecord.ota_share_percent}% share`
                : "Stack rate"}
          </span>
        </span>
        {Number(clientRecord.deduct_percent) > 0 && (
          <span className="text-ink-secondary">
            Deduction: <span className="text-ink-primary">{clientRecord.deduct_percent}%</span>
          </span>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 text-xs text-ink-secondary mb-1">
          <KeyRound size={13} />
          Portal login
        </div>
        {loginEmail ? (
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-ink-primary">{loginEmail}</p>
              <p className="text-[11px] text-ink-muted mt-1">
                Placeholder addresses receive no mail, so &ldquo;Forgot password&rdquo; can&apos;t
                reach this owner. Set one here and pass it on.
              </p>
            </div>
            <form action={setClientPassword} className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
              <input type="hidden" name="client_id" value={id} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="new_password" className={fieldLabel}>
                  New password
                </label>
                <input
                  id="new_password"
                  name="new_password"
                  type="text"
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  className={`${fieldInput} w-full sm:w-48`}
                />
              </div>
              <button type="submit" className={`${secondaryButton} py-2`}>
                Set password
              </button>
            </form>
          </div>
        ) : (
          <form action={createLoginForClient} className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:flex-wrap mt-2">
            <input type="hidden" name="client_id" value={id} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login_email" className={fieldLabel}>
                Email
              </label>
              <input
                id="login_email"
                name="login_email"
                type="email"
                required
                placeholder="owner@example.com"
                className={`${fieldInput} w-full sm:w-56`}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login_password" className={fieldLabel}>
                Password
              </label>
              <input
                id="login_password"
                name="login_password"
                type="text"
                required
                placeholder="At least 8 characters"
                className={`${fieldInput} w-full sm:w-48`}
              />
            </div>
            <button type="submit" className={`${primaryButton} text-xs py-2`} style={primaryButtonStyle}>
              Create login
            </button>
          </form>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-secondary">Properties</h2>
          <Link
            href={`/admin/clients/${id}/properties/new`}
            className="btn btn-gold btn-sm"
          >
            <Plus size={13} strokeWidth={2.5} />
            Add property
          </Link>
        </div>

        {(!properties || properties.length === 0) && (
          <div className="card p-8 text-center text-sm text-ink-secondary">
            No properties yet for this client.
          </div>
        )}

        {properties && properties.length > 0 && (
          <div className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
            {properties.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-primary truncate">{p.name}</p>
                  <p className="text-xs text-ink-secondary truncate mt-0.5">
                    {p.location}
                    {p.city ? `, ${p.city}` : ""}
                    {p.province ? `, ${p.province}` : ""}
                  </p>
                </div>
                <span className="text-xs text-ink-secondary shrink-0 hidden sm:inline">{typeLabel(p.type)}</span>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-ink-secondary capitalize shrink-0">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${STATUS_COLOR[p.status] ?? "bg-status-blocked"}`}
                  />
                  {p.status}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={`/admin/calendar?property=${p.id}`}
                    className="p-1.5 rounded-md text-ink-muted hover:text-ink-primary hover:bg-surface-2 transition-colors"
                    aria-label="View calendar"
                  >
                    <CalendarDays size={14} />
                  </Link>
                  <Link
                    href={`/admin/clients/${id}/properties/${p.id}/edit`}
                    className="p-1.5 rounded-md text-ink-muted hover:text-ink-primary hover:bg-surface-2 transition-colors"
                    aria-label="Edit property"
                  >
                    <Pencil size={14} />
                  </Link>
                  <form action={deletePropertyRecord}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="client_id" value={id} />
                    <ConfirmDeleteButton
                      confirmText={`Delete ${p.name}? This cannot be undone.`}
                      label="Delete property"
                      className="p-1.5 rounded-md text-ink-muted hover:text-status-booked hover:bg-status-booked/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </ConfirmDeleteButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink-secondary">Bookings</h2>
          <div className="flex items-center gap-3">
            {awaiting > 0 && (
              <span className="text-xs text-status-pending">
                {formatPKR(awaiting)} awaiting
              </span>
            )}
            <Link
              href={`/admin/bookings?client=${id}`}
              className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
            >
              All bookings →
            </Link>
          </div>
        </div>

        {(!recentBookings || recentBookings.length === 0) && (
          <div className="card p-8 text-center text-sm text-ink-secondary">
            No bookings for this client yet.
          </div>
        )}

        {recentBookings && recentBookings.length > 0 && (
          <div className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
            {recentBookings.map((b) => {
              const unitNames = (b.booking_properties as unknown as { properties: { name: string } | null }[])
                ?.map((bp) => bp.properties?.name)
                .filter(Boolean)
                .join(", ");
              const nights = nightsBetween(b.check_in, b.check_out);
              return (
                <Link
                  key={b.id}
                  href={`/admin/bookings/${b.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 transition-colors"
                >
                  <ChannelBadge source={b.source} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-primary truncate">{b.guest_name ?? "Guest"}</p>
                    <p className="text-xs text-ink-secondary truncate mt-0.5">
                      {formatDayMonth(b.check_in)} → {formatDayMonth(b.check_out)} ({nights}n)
                      {unitNames ? ` · ${unitNames}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-financial shrink-0">{formatPKR(b.hostello_share)}</span>
                  <span className="text-xs shrink-0 w-16 text-right">
                    {b.status === "tentative" ? (
                      <span className="text-status-pending">Tentative</span>
                    ) : b.share_received ? (
                      <span className="text-financial">Received</span>
                    ) : (
                      <span className="text-ink-muted">Awaiting</span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
