import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { propertyTypeLabel } from "@/lib/property-types";
import { formatPKR } from "@/lib/payout";

const STATUS_COLOR: Record<string, string> = {
  active: "bg-status-available",
  inactive: "bg-status-blocked",
};

export default async function ClientPropertiesPage() {
  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  // `properties_v`'s WHERE clause is what scopes this to their own units — no
  // client_id filter here, same as the availability finder. Inactive ones are
  // listed too: an owner should see a unit that has been taken off sale.
  const { data: properties } = await supabase
    .from("properties_v")
    .select(
      "id, name, location, city, province, type, status, max_guests, nightly_rate, short_stay_rate, stack_rate, short_stay_stack_rate"
    )
    .order("name");

  // The stack rate is a floor Hostello owes per night, and only under a deal
  // that has one. Showing it elsewhere would read as an asking price.
  const showsStackRate =
    clientRecord.deal_model === "ads" ||
    clientRecord.deal_model === "fixed_stack" ||
    clientRecord.ota_model === "stack";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow">YOUR PROPERTIES</p>
        <h1 className="text-2xl md:text-3xl font-semibold mt-1.5">Properties</h1>
        <p className="text-sm text-ink-secondary mt-2">
          Every unit on your account, and what it is listed at.
        </p>
      </div>

      {!properties || properties.length === 0 ? (
        <div className="card p-8 md:p-10 text-center text-sm text-ink-secondary">
          No properties on your account yet.
        </div>
      ) : (
        <div className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
          {properties.map((p) => {
            const place = [p.location, p.city, p.province].filter(Boolean).join(", ");
            const type = propertyTypeLabel(p.type);
            return (
              <div
                key={p.id}
                className="flex items-start gap-4 px-5 py-4 flex-wrap sm:flex-nowrap"
              >
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

                <div className="text-right shrink-0 text-xs">
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
            );
          })}
        </div>
      )}
    </div>
  );
}
