import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { CopyLinkButton } from "@/components/admin/CopyLinkButton";
import { SubmitButton } from "@/components/shared/Busy";
import { PageHeader } from "@/components/shared/PageHeader";
import { ago } from "@/lib/channel-health";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { errorBanner, fieldInput, fieldLabel, noticeBanner } from "@/lib/form-styles";
import { addHostCalendarLink, createHostCalendarExport, removeHostCalendarLink } from "../../actions";

export default async function HostCalendarLinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const client = await currentClient();
  if (!client || client.account_type !== "host") redirect("/client/properties");

  const supabase = await createClient();
  const { data: property } = await supabase
    .from("properties")
    .select("id, name")
    .eq("id", id)
    .eq("client_id", client.id)
    .maybeSingle();
  if (!property) notFound();

  const [{ data: feeds }, { data: exportRow }] = await Promise.all([
    supabase
      .from("calendar_feeds")
      .select("id, source, last_synced_at, last_error")
      .eq("property_id", id)
      .order("created_at"),
    supabase.from("calendar_exports").select("token, last_fetched_at").eq("property_id", id).maybeSingle(),
  ]);

  const exportUrl = exportRow ? `${SUPABASE_URL}/functions/v1/ical/${exportRow.token}` : null;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Calendar links"
        sub={property.name}
        back={{ href: "/client/properties", label: "Properties" }}
        info={
          <p>
            Bring your Airbnb or Booking.com dates in, so nights booked there block this
            calendar. Then send your dates back out, so a booking you type in here closes those
            nights on Airbnb.
          </p>
        }
      />

      {error && <p className={errorBanner}>{error}</p>}
      {notice && <p className={noticeBanner}>{notice}</p>}

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="text-base">Bring dates in</h2>
        <p className="text-xs text-ink-secondary">
          In Airbnb: Calendar, Availability, Connect calendars, Export calendar. Copy the link and
          paste it here.
        </p>
        {(feeds ?? []).length > 0 && (
          <ul className="flex flex-col gap-2">
            {(feeds ?? []).map((f) => (
              <li key={f.id} className="tile px-3 py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-ink-primary">{f.source === "booking_com" ? "Booking.com" : "Airbnb"}</p>
                  <p className="text-[11px] text-ink-muted">
                    {f.last_error
                      ? `Could not read it: ${f.last_error}`
                      : f.last_synced_at
                        ? `Last read ${ago(f.last_synced_at)}`
                        : "Waiting for the first read"}
                  </p>
                </div>
                <form action={removeHostCalendarLink}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="property_id" value={id} />
                  <ConfirmDeleteButton
                    confirmText="Disconnect this calendar? The dates it brought in are removed."
                    label="Disconnect"
                    busy="Disconnecting…"
                    className="text-xs text-ink-muted hover:text-status-booked transition-colors"
                  />
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addHostCalendarLink} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="property_id" value={id} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="source" className={fieldLabel}>
              From
            </label>
            <select id="source" name="source" className={fieldInput} defaultValue="airbnb">
              <option value="airbnb">Airbnb</option>
              <option value="booking_com">Booking.com</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-[14rem]">
            <label htmlFor="url" className={fieldLabel}>
              Calendar link
            </label>
            <input
              id="url"
              name="url"
              required
              placeholder="https://www.airbnb.com/calendar/ical/…"
              className={fieldInput}
            />
          </div>
          <SubmitButton className="btn btn-primary" busy="Connecting…">
            Connect
          </SubmitButton>
        </form>
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <h2 className="text-base">Send dates out</h2>
        <p className="text-xs text-ink-secondary">
          In Airbnb: Calendar, Availability, Connect calendars, Import calendar. Paste this link
          there. Dates only; no guest names or prices leave Hostello.
        </p>
        {exportUrl ? (
          <div className="flex items-center gap-3">
            <code className="text-[11px] text-ink-secondary truncate flex-1">{exportUrl}</code>
            <CopyLinkButton
              value={exportUrl}
              className="text-xs text-ink-muted hover:text-ink-primary inline-flex items-center gap-1 transition-colors"
            />
          </div>
        ) : (
          <form action={createHostCalendarExport}>
            <input type="hidden" name="property_id" value={id} />
            <SubmitButton className="btn btn-ghost btn-sm" busy="Creating the link…">
              Create my link
            </SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
