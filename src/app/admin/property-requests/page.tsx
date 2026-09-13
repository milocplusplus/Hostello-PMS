import Link from "next/link";
import { PencilRuler } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
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
import { applyPropertyChangeRequest, declinePropertyChangeRequest } from "./actions";

type Row = {
  id: string;
  property_id: string;
  client_id: string;
  max_guests: number | null;
  nightly_rate: number | null;
  note: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  properties: { name: string; max_guests: number | null; nightly_rate: number | null } | null;
  clients: { name: string } | null;
};

/**
 * What owners have asked for on their own units, in one queue.
 *
 * It is a queue and not a card on each client page because the thing an admin
 * does here is clear a backlog, not look up one property — and because it gives
 * the `property_change_requested` notification a single place to land.
 */
export default async function PropertyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();

  // The embeds are aliased onto the masked views — `properties_v` / `clients_v`
  // are how anything with money on it is read, and the join keeps its name.
  const { data } = await supabase
    .from("property_change_requests")
    .select(
      "id, property_id, client_id, max_guests, nightly_rate, note, status, admin_note, created_at, reviewed_at, properties:properties_v(name, max_guests, nightly_rate), clients:clients_v(name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as Row[];
  const pending = rows.filter((r) => r.status === "pending");
  const settled = rows.filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow">MANAGEMENT</p>
        <h1 className="text-2xl md:text-3xl font-semibold mt-1.5">Rate requests</h1>
        <p className="text-sm text-ink-secondary mt-2">
          Owners asking for a capacity or a nightly rate to change on their own units. Applying
          one writes it straight onto the property; nothing here touches a deal term.
        </p>
      </div>

      {error && <p className={errorBanner}>{error}</p>}

      {pending.length === 0 ? (
        <div className="card p-8 md:p-10 text-center text-sm text-ink-secondary">
          No requests waiting.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((r) => {
            const lines = describeChange(
              {
                maxGuests: r.max_guests,
                nightlyRate: r.nightly_rate == null ? null : Number(r.nightly_rate),
              },
              {
                maxGuests:
                  r.properties?.max_guests == null ? null : Number(r.properties.max_guests),
                nightlyRate:
                  r.properties?.nightly_rate == null ? null : Number(r.properties.nightly_rate),
              }
            );

            return (
              <div key={r.id} className="card p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm text-ink-primary flex items-center gap-2">
                      <PencilRuler size={14} className="text-ink-muted shrink-0" />
                      {r.properties?.name ?? "Property"}
                    </p>
                    <p className="text-xs text-ink-secondary mt-1">
                      {r.clients?.name ?? "Client"} · asked{" "}
                      {formatDayMonth(String(r.created_at).slice(0, 10))}
                    </p>
                  </div>
                  <Link
                    href={`/admin/clients/${r.client_id}`}
                    className="text-xs text-ink-muted hover:text-ink-primary transition-colors shrink-0"
                  >
                    Open client →
                  </Link>
                </div>

                <ul className="tile px-3 py-2.5 text-xs text-ink-primary flex flex-col gap-1">
                  {lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>

                {r.note && <p className="text-xs text-ink-secondary">“{r.note}”</p>}

                {/* One note box, read by whichever button is pressed — the
                    reason matters far more on a decline, but an admin applying
                    a rate with a caveat should not have to find somewhere else
                    to put it. */}
                <form
                  action={applyPropertyChangeRequest}
                  className="flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="id" value={r.id} />
                  <div className="flex flex-col gap-1.5 flex-1 min-w-[14rem]">
                    <label htmlFor={`note_${r.id}`} className={fieldLabel}>
                      Note back to the owner (optional)
                    </label>
                    <input
                      id={`note_${r.id}`}
                      name="admin_note"
                      placeholder="e.g. Applied from 1 Oct, or why not"
                      className={`${fieldInput} py-1.5 text-xs`}
                    />
                  </div>
                  {/* Both in one form so the note reaches either button;
                      `whenAction` is what stops both announcing themselves. */}
                  <SubmitButton
                    whenAction={applyPropertyChangeRequest}
                    className="btn btn-gold btn-sm"
                    busy="Applying the change…"
                  >
                    Apply
                  </SubmitButton>
                  <SubmitButton
                    formAction={declinePropertyChangeRequest}
                    whenAction={declinePropertyChangeRequest}
                    className="btn btn-ghost btn-sm"
                    busy="Declining the request…"
                  >
                    Decline
                  </SubmitButton>
                </form>
              </div>
            );
          })}
        </div>
      )}

      {settled.length > 0 && (
        <section className="card overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-border-hairline">
            <h2 className="text-sm font-medium text-ink-primary">Already ruled on</h2>
          </div>
          <ul className="divide-y divide-[var(--color-border-hairline)]">
            {settled.map((r) => {
              const status = (isRequestStatus(r.status) ? r.status : "declined") as RequestStatus;
              return (
                <li key={r.id} className="px-4 md:px-5 py-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink-primary truncate">
                      {r.properties?.name ?? "Property"}
                      <span className="text-ink-muted"> · {r.clients?.name ?? "Client"}</span>
                    </p>
                    <p className="text-[11px] text-ink-secondary mt-0.5">
                      {[
                        r.max_guests != null && `Sleeps ${r.max_guests}`,
                        r.nightly_rate != null && `${formatPKR(Number(r.nightly_rate))} / night`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {r.admin_note && (
                      <p className="text-[11px] text-ink-muted mt-1">{r.admin_note}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[11px] ${REQUEST_STATUS[status].tone}`}>
                      {REQUEST_STATUS[status].label}
                    </p>
                    <p className="text-[11px] text-ink-muted mt-0.5">
                      {formatDayMonth(String(r.reviewed_at ?? r.created_at).slice(0, 10))}
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
