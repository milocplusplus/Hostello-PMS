import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { CopyLinkButton } from "@/components/admin/CopyLinkButton";
import { HealthChip } from "@/components/admin/HealthChip";
import { SubmitButton } from "@/components/shared/Busy";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { ago, exportHealth } from "@/lib/channel-health";
import { fieldLabel, fieldInput, primaryButton, errorBanner, noticeBanner } from "@/lib/form-styles";
import { PageHeader } from "@/components/shared/PageHeader";
import { createCalendarExport, regenerateCalendarExport, removeCalendarExport } from "../actions";

type ExportRow = {
  id: string;
  token: string;
  last_fetched_at: string | null;
  fetch_count: number;
  created_at: string;
  properties: { name: string; clients: { name: string } | null } | null;
};

/** The other direction: a link per unit that a channel reads our dates from. */
export default async function OutgoingCalendarsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const [{ data: properties }, { data: exports }] = await Promise.all([
    supabase.from("properties_v").select("id, name, clients:clients_v(name)").eq("bookable", true).order("name"),
    supabase
      .from("calendar_exports")
      .select("id, token, last_fetched_at, fetch_count, created_at, properties:properties_v(name, clients:clients_v(name))")
      .eq("active", true)
      .order("created_at", { ascending: false }),
  ]);

  const rows = (exports ?? []) as unknown as ExportRow[];

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <PageHeader
        title="Send our dates out"
        back={{ href: "/admin/calendar/feeds", label: "Channel calendars" }}
        info={
          <p>
            Publish a unit&apos;s booked and blocked nights as a link, then paste it into the
            channel so it closes those dates too. The channel decides when to re-read it — Airbnb
            is usually about every 2 hours, and that cannot be hurried. Anyone holding the link can
            see the dates, so treat it as a password.
          </p>
        }
      />

      {notice && <p className={noticeBanner}>{notice}</p>}
      {error && <p className={errorBanner}>{error}</p>}

      <form action={createCalendarExport} className="card p-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <label htmlFor="export_property_id" className={fieldLabel}>
            Unit
          </label>
          <select id="export_property_id" name="property_id" required className={fieldInput}>
            {properties?.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.clients as unknown as { name: string } | null)?.name ?? "—"} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton className={`${primaryButton} shrink-0`} busy="Creating the link…">
          Create link
        </SubmitButton>
      </form>

      <div className="card p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">No links published yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const url = `${SUPABASE_URL}/functions/v1/ical/${row.token}`;
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-1.5 text-sm border-b border-border-hairline last:border-0 pb-3 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-ink-primary truncate">
                      {row.properties?.clients?.name ?? "—"} · {row.properties?.name ?? "—"}
                    </p>
                    <div className="flex items-center gap-3 shrink-0">
                      <CopyLinkButton
                        value={url}
                        className="text-xs text-ink-muted hover:text-ink-primary inline-flex items-center gap-1 transition-colors"
                      />
                      <form action={regenerateCalendarExport}>
                        <input type="hidden" name="id" value={row.id} />
                        <ConfirmDeleteButton
                          confirmText="Issue a new link? The current one stops working immediately, and you will have to paste the new one into every channel using it."
                          label="New link"
                          busy="Issuing a new link…"
                          className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
                        />
                      </form>
                      <form action={removeCalendarExport}>
                        <input type="hidden" name="id" value={row.id} />
                        <ConfirmDeleteButton
                          confirmText="Delete this link? Any channel pointed at it will stop receiving updates."
                          label="Delete"
                          busy="Deleting the link…"
                          className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                        />
                      </form>
                    </div>
                  </div>

                  <code className="text-xs text-ink-muted break-all bg-surface-2 rounded px-2 py-1.5">{url}</code>

                  <div>
                    <HealthChip health={exportHealth(row)} />
                  </div>
                  <p className="text-xs text-ink-muted">
                    {row.last_fetched_at
                      ? `Last read by a channel ${ago(row.last_fetched_at)} · ${row.fetch_count} reads`
                      : "Not read by a channel yet — it can take a couple of hours after you paste it in."}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
