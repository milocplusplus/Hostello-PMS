import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { errorBanner, fieldInput, fieldLabel, noticeBanner, primaryButton } from "@/lib/form-styles";
import { PageHeader } from "@/components/shared/PageHeader";
import { SubmitButton } from "@/components/shared/Busy";
import { saveChannelIds } from "../../actions";

/**
 * The numbers Airbnb and Booking.com know each of this client's units by.
 *
 * Channel emails are routed by these, not by the listing's title. Booking.com
 * is the odd one: its property ID is a whole building, and flats sold as one
 * shared room type are told apart only here — the channel never says which
 * flat a guest got.
 */
export default async function ClientChannelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireOwner();
  const { id } = await params;
  const { error, notice } = await searchParams;

  const supabase = await createClient();
  const [{ data: client }, { data: units }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", id).maybeSingle(),
    supabase
      .from("properties")
      .select("id, name, status, airbnb_listing_id, booking_hotel_id, booking_room_type")
      .eq("client_id", id)
      .order("name"),
  ]);
  if (!client) notFound();

  const rows = units ?? [];
  const roomTypes = [
    ...new Set(rows.map((u) => u.booking_room_type).filter((t): t is string => Boolean(t))),
  ].sort();

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      <PageHeader
        title="Channel listings"
        sub={client.name}
        back={{ href: `/admin/clients/${id}`, label: client.name }}
        info={
          <>
            <p>
              <strong>Airbnb listing number</strong> — the digits in the listing&apos;s link
              (airbnb.com/rooms/<em>1234…</em>). Pasting the whole link works too.
            </p>
            <p className="mt-2">
              <strong>Booking.com property ID</strong> — shown at the top of the extranet. One
              building has one ID, so several units can share it.
            </p>
            <p className="mt-2">
              <strong>Shared room type</strong> — fill in only when Booking.com sells several of
              these units as one room type (e.g. &quot;Deluxe Studio&quot;). Booking.com never
              says which of them a guest got, so the inbox asks you to pick one, and you&apos;re
              reminded to change that room type&apos;s availability on Booking.com when one of
              them is booked some other way.
            </p>
          </>
        }
      />
      {notice && <p className={noticeBanner}>{notice}</p>}
      {error && <p className={errorBanner}>{error}</p>}

      {rows.length === 0 ? (
        <p className="card p-8 text-center text-sm text-ink-secondary">This client has no units yet.</p>
      ) : (
        <form action={saveChannelIds} className="flex flex-col gap-3">
          <input type="hidden" name="client_id" value={id} />
          <datalist id="room-types">
            {roomTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          {rows.map((u) => (
            <div key={u.id} className="card p-4 flex flex-col gap-3">
              <input type="hidden" name="unit_ids" value={u.id} />
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{u.name}</span>
                {u.status !== "active" && (
                  <span className="text-[11px] text-ink-muted">inactive</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabel} htmlFor={`airbnb_${u.id}`}>
                    Airbnb listing number
                  </label>
                  <input
                    id={`airbnb_${u.id}`}
                    name={`airbnb_${u.id}`}
                    defaultValue={u.airbnb_listing_id ?? ""}
                    inputMode="numeric"
                    placeholder="Not on Airbnb"
                    className={fieldInput}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabel} htmlFor={`hotel_${u.id}`}>
                    Booking.com property ID
                  </label>
                  <input
                    id={`hotel_${u.id}`}
                    name={`hotel_${u.id}`}
                    defaultValue={u.booking_hotel_id ?? ""}
                    inputMode="numeric"
                    placeholder="Not on Booking.com"
                    className={fieldInput}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabel} htmlFor={`type_${u.id}`}>
                    Shared room type
                  </label>
                  <input
                    id={`type_${u.id}`}
                    name={`type_${u.id}`}
                    defaultValue={u.booking_room_type ?? ""}
                    list="room-types"
                    placeholder="Its own room type"
                    className={fieldInput}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="flex justify-end">
            <SubmitButton className={primaryButton} busy="Saving…">
              Save
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
