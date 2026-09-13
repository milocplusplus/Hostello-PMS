import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, MapPin, PencilRuler, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { propertyTypeLabel } from "@/lib/property-types";
import { formatPKR } from "@/lib/payout";
import { formatDayMonth } from "@/lib/calendar";
import {
  describeChange,
  isRequestStatus,
  REQUEST_STATUS,
  type RequestStatus,
} from "@/lib/property-requests";
import { errorBanner, fieldInput, fieldLabel } from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { requestPropertyChange, withdrawPropertyChangeRequest } from "./actions";

const STATUS_COLOR: Record<string, string> = {
  active: "bg-status-available",
  inactive: "bg-status-blocked",
};

type RequestRow = {
  id: string;
  property_id: string;
  max_guests: number | null;
  nightly_rate: number | null;
  note: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

export default async function ClientPropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; open?: string }>;
}) {
  const { error, open } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  // `properties_v`'s WHERE clause is what scopes this to their own units — no
  // client_id filter here, same as the availability finder. Inactive ones are
  // listed too: an owner should see a unit that has been taken off sale.
  // The requests ride along: they depend on nothing the properties query
  // returns, so they cost no extra round trip.
  const [{ data: properties }, { data: requests }] = await Promise.all([
    supabase
      .from("properties_v")
      .select(
        "id, name, location, city, province, type, status, max_guests, nightly_rate, short_stay_rate, stack_rate, short_stay_stack_rate"
      )
      .order("name"),
    supabase
      .from("property_change_requests")
      .select("id, property_id, max_guests, nightly_rate, note, status, admin_note, created_at")
      .eq("client_id", clientRecord.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // The stack rate is a floor Hostello owes per night, and only under a deal
  // that has one. Showing it elsewhere would read as an asking price.
  const showsStackRate =
    clientRecord.deal_model === "ads" ||
    clientRecord.deal_model === "fixed_stack" ||
    clientRecord.ota_model === "stack";

  const rows = (requests ?? []) as RequestRow[];
  // One open ask per property is a database constraint, so this is a lookup and
  // not a list.
  const openRequest = new Map<string, RequestRow>();
  for (const r of rows) if (r.status === "pending") openRequest.set(r.property_id, r);
  const settled = rows.filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow">YOUR PROPERTIES</p>
        <h1 className="text-2xl md:text-3xl font-semibold mt-1.5">Properties</h1>
        <p className="text-sm text-ink-secondary mt-2">
          Every unit on your account, and what it is listed at. Ask Hostello to change a
          capacity or a nightly rate and it is applied here once they agree.
        </p>
      </div>

      {error && <p className={errorBanner}>{error}</p>}

      {!properties || properties.length === 0 ? (
        <div className="card p-8 md:p-10 text-center text-sm text-ink-secondary">
          No properties on your account yet.
        </div>
      ) : (
        <div className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
          {properties.map((p) => {
            const place = [p.location, p.city, p.province].filter(Boolean).join(", ");
            const type = propertyTypeLabel(p.type);
            const pending = openRequest.get(p.id);
            const current = {
              maxGuests: p.max_guests == null ? null : Number(p.max_guests),
              nightlyRate: p.nightly_rate == null ? null : Number(p.nightly_rate),
            };

            return (
              <div key={p.id} className="px-5 py-4 flex flex-col gap-3">
                <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-primary truncate">{p.name}</p>
                    {place && (
                      <p className="text-xs text-ink-secondary truncate mt-0.5 flex items-center gap-1.5">
                        <MapPin size={12} className="shrink-0" />
                        {place}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-ink-muted mt-1.5 flex-wrap">
                      {type && <span>{type}</span>}
                      {p.max_guests ? (
                        <span className="flex items-center gap-1">
                          <Users size={11} />
                          Sleeps {p.max_guests}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1.5 capitalize">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            STATUS_COLOR[p.status] ?? "bg-status-blocked"
                          }`}
                        />
                        {p.status}
                      </span>
                    </div>
                  </div>

                  {/* On a phone the rates take their own line under the name.
                      The row already wraps, but `flex-1` on the name column
                      meant it shrank to nothing instead — so the name and the
                      location truncated mid-word to make space for a figure
                      that had a whole line free beneath it. `basis-full` is
                      what actually breaks the line; `order-last` keeps the
                      calendar icon up beside the name where it was. */}
                  <div className="order-last basis-full text-left mt-1 shrink-0 text-xs sm:order-none sm:basis-auto sm:text-right sm:mt-0">
                    {p.nightly_rate ? (
                      <p className="text-ink-primary">
                        {formatPKR(Number(p.nightly_rate))}
                        <span className="text-ink-muted"> / night</span>
                      </p>
                    ) : (
                      <p className="text-ink-muted">No nightly rate set</p>
                    )}
                    {p.short_stay_rate ? (
                      <p className="text-ink-secondary mt-0.5">
                        {formatPKR(Number(p.short_stay_rate))}
                        <span className="text-ink-muted"> / short stay</span>
                      </p>
                    ) : null}
                    {showsStackRate && p.stack_rate ? (
                      <p className="text-hostello-gold mt-1">
                        Your rate {formatPKR(Number(p.stack_rate))}
                        <span className="opacity-70"> / night</span>
                      </p>
                    ) : null}
                  </div>

                  <Link
                    href="/client/calendar"
                    className="p-1.5 rounded-md text-ink-muted hover:text-ink-primary hover:bg-surface-2 transition-colors shrink-0"
                    aria-label={`Calendar for ${p.name}`}
                  >
                    <CalendarDays size={14} />
                  </Link>
                </div>

                {/* One open ask per unit, so a property either shows what is
                    waiting or offers the form — never both. */}
                {pending ? (
                  <div className="tile px-3 py-2.5 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs ${REQUEST_STATUS.pending.tone}`}>
                        {REQUEST_STATUS.pending.label}
                      </p>
                      <ul className="text-[11px] text-ink-secondary mt-1 flex flex-col gap-0.5">
                        {describeChange(
                          {
                            maxGuests: pending.max_guests,
                            nightlyRate:
                              pending.nightly_rate == null ? null : Number(pending.nightly_rate),
                          },
                          current
                        ).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      {pending.note && (
                        <p className="text-[11px] text-ink-muted mt-1">“{pending.note}”</p>
                      )}
                    </div>
                    <form action={withdrawPropertyChangeRequest} className="shrink-0">
                      <input type="hidden" name="id" value={pending.id} />
                      <ConfirmDeleteButton
                        confirmText="Withdraw this change request?"
                        label="Withdraw"
                        busy="Withdrawing the request…"
                        className="text-[11px] text-ink-muted hover:text-status-booked transition-colors"
                      />
                    </form>
                  </div>
                ) : (
                  <details className="group" open={open === p.id}>
                    <summary className="flex items-center gap-2 text-xs text-ink-secondary hover:text-ink-primary cursor-pointer list-none transition-colors">
                      <PencilRuler size={13} className="text-ink-muted" />
                      Request a change
                    </summary>

                    <form
                      action={requestPropertyChange}
                      className="mt-3 flex flex-wrap items-end gap-3"
                    >
                      <input type="hidden" name="property_id" value={p.id} />
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={`mg_${p.id}`} className={fieldLabel}>
                          Sleeps
                        </label>
                        <input
                          id={`mg_${p.id}`}
                          name="max_guests"
                          type="number"
                          min={1}
                          step={1}
                          placeholder={p.max_guests ? String(p.max_guests) : "Not set"}
                          className={`${fieldInput} py-1.5 text-xs w-28`}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={`nr_${p.id}`} className={fieldLabel}>
                          Nightly rate (PKR)
                        </label>
                        <input
                          id={`nr_${p.id}`}
                          name="nightly_rate"
                          type="number"
                          min={0}
                          step="any"
                          placeholder={p.nightly_rate ? String(p.nightly_rate) : "Not set"}
                          className={`${fieldInput} py-1.5 text-xs w-36`}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1 min-w-[12rem]">
                        <label htmlFor={`note_${p.id}`} className={fieldLabel}>
                          Why (optional)
                        </label>
                        <input
                          id={`note_${p.id}`}
                          name="note"
                          placeholder="e.g. Added a sofa bed, peak season"
                          className={`${fieldInput} py-1.5 text-xs`}
                        />
                      </div>
                      <SubmitButton className="btn btn-ghost btn-sm" busy="Sending the request…">
                        Send request
                      </SubmitButton>
                    </form>
                    <p className="text-[11px] text-ink-muted mt-2">
                      Leave a box empty to keep it as it is. Nothing changes until Hostello
                      applies it — you&apos;ll get a notification either way.
                    </p>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      {settled.length > 0 && (
        <section className="card overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
            <h2 className="text-sm font-medium text-ink-primary">Past requests</h2>
          </div>
          <ul className="divide-y divide-[var(--color-border-hairline)]">
            {settled.map((r) => {
              const unit = (properties ?? []).find((p) => p.id === r.property_id);
              const status = (isRequestStatus(r.status) ? r.status : "declined") as RequestStatus;
              return (
                <li key={r.id} className="px-4 md:px-5 py-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink-primary truncate">{unit?.name ?? "Property"}</p>
                    <p className="text-[11px] text-ink-secondary mt-0.5">
                      {/* An applied request already moved the unit's figures, so
                          "→ today's value" would read as no change at all. The
                          ask is stated on its own instead. */}
                      {[
                        r.max_guests != null && `Sleeps ${r.max_guests}`,
                        r.nightly_rate != null &&
                          `${formatPKR(Number(r.nightly_rate))} / night`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {r.admin_note && (
                      <p className="text-[11px] text-ink-muted mt-1">Hostello: {r.admin_note}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[11px] ${REQUEST_STATUS[status].tone}`}>
                      {REQUEST_STATUS[status].label}
                    </p>
                    <p className="text-[11px] text-ink-muted mt-0.5">
                      {formatDayMonth(String(r.created_at).slice(0, 10))}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
