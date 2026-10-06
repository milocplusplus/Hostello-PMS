import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { SubmitButton } from "@/components/shared/Busy";
import { BOOKING_SOURCES } from "@/lib/block-sources";
import { fieldLabel, fieldInput, primaryButton, errorBanner } from "@/lib/form-styles";
import { PageHeader } from "@/components/shared/PageHeader";
import { addCalendarFeed } from "../actions";

/** Connect one channel calendar to one unit. `?property=` picks the unit. */
export default async function ConnectCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string; error?: string }>;
}) {
  const { property, error } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const { data: properties } = await supabase
    .from("properties_v")
    .select("id, name, clients:clients_v(name)")
    .eq("bookable", true)
    .order("name");

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <PageHeader
        title="Connect a calendar"
        back={{ href: "/admin/calendar/feeds", label: "Channel calendars" }}
        info={
          <p>
            Paste the calendar link a channel gives you for one listing. Hostello reads it straight
            away and then every minute, and closes the nights it holds. The link carries dates
            only, so each stay&apos;s guest and price are still entered by hand.
          </p>
        }
      />

      {error && <p className={errorBanner}>{error}</p>}

      <form action={addCalendarFeed} className="card p-5 md:p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="property_id" className={fieldLabel}>
            Unit
          </label>
          <select id="property_id" name="property_id" required defaultValue={property ?? ""} className={fieldInput}>
            <option value="" disabled>
              Pick a unit
            </option>
            {properties?.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.clients as unknown as { name: string } | null)?.name ?? "—"} · {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="source" className={fieldLabel}>
            Channel
          </label>
          <select id="source" name="source" defaultValue="airbnb" className={fieldInput}>
            {BOOKING_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="url" className={fieldLabel}>
            Calendar link (.ics)
          </label>
          <input
            id="url"
            name="url"
            type="url"
            required
            placeholder="https://www.airbnb.com/calendar/ical/12345678.ics?s=…"
            className={fieldInput}
          />
          <p className="text-xs text-ink-muted">
            In Airbnb: Calendar → Availability → Connect calendars → Export calendar.
          </p>
        </div>

        <details className="group">
          <summary className="cursor-pointer text-xs font-bold text-ink-muted hover:text-ink-secondary w-fit">
            More options
          </summary>
          <div className="flex flex-col gap-4 mt-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="label" className={fieldLabel}>
                Label
              </label>
              <input id="label" name="label" placeholder="e.g. Airbnb listing — Studio A" className={fieldInput} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="listing_ref" className={fieldLabel}>
                Listing name on the channel
              </label>
              <input id="listing_ref" name="listing_ref" placeholder="e.g. Gulberg Heights Loft" className={fieldInput} />
              <p className="text-xs text-ink-muted">
                Only used by the{" "}
                <Link href="/admin/channel-inbox" className="text-hostello-gold hover:underline">
                  channel inbox
                </Link>
                , to route this listing&apos;s reservation emails to this unit. A distinctive
                fragment of the listing&apos;s title is enough.
              </p>
            </div>
          </div>
        </details>

        <SubmitButton
          className={`mt-1 ${primaryButton}`}
          blocking
          busy="Reading the channel calendar…"
          note="Fetching the link and importing every date it holds."
        >
          Connect calendar
        </SubmitButton>
      </form>
    </div>
  );
}
