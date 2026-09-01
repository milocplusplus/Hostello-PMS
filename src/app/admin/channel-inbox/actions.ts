"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { createBookingInline, cancelBooking } from "@/app/admin/bookings/actions";
import type { ParsedReservation } from "@/lib/ota";

/**
 * Acting on what a channel emailed in.
 *
 * The rule this file exists to keep: **approving is an ordinary booking write.**
 * It builds the same FormData the booking form builds and hands it to the same
 * `createBookingInline`, so `calculatePayout()` runs, the deal terms are
 * snapshotted, the clash check happens and `notifyBookingCreated` fires — all
 * of it identical to a booking typed in by hand. Nothing here re-derives a
 * split, and nothing here writes to `bookings` directly.
 */

function backTo(params: Record<string, string>) {
  return `/admin/channel-inbox?${new URLSearchParams(params).toString()}`;
}

function refresh() {
  revalidatePath("/admin/channel-inbox");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
  revalidatePath("/client", "layout");
}

type MessageRow = {
  id: string;
  kind: string;
  status: string;
  source: string | null;
  property_id: string | null;
  booking_id: string | null;
  external_ref: string | null;
  parsed: ParsedReservation | null;
};

async function loadMessage(id: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("ota_messages")
    .select("id, kind, status, source, property_id, booking_id, external_ref, parsed")
    .eq("id", id)
    .maybeSingle();

  return { supabase, message: data as MessageRow | null };
}

/** Stamps who dealt with it, so the inbox is an audit trail and not just a queue. */
async function close(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  status: "applied" | "ignored",
  extra: Record<string, unknown> = {}
) {
  const user = await currentUser();

  await supabase
    .from("ota_messages")
    .update({
      status,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
      ...extra,
    })
    .eq("id", id);
}

/**
 * Turn a reviewed reservation email into a booking.
 *
 * The form the admin submits is authoritative, not the parsed values — the
 * parse only supplies the defaults. That is the whole point of holding these
 * for review: a channel that renamed a label must cost a correction, never a
 * wrong booking.
 */
export async function approveReservation(formData: FormData) {
  const id = (formData.get("id") as string) || "";
  const { supabase, message } = await loadMessage(id);

  if (!message) redirect(backTo({ error: "That message is gone." }));
  if (message.status === "applied") {
    redirect(backTo({ error: "That reservation has already been added." }));
  }

  const property_id = ((formData.get("property_id") as string) || message.property_id || "").trim();
  if (!property_id) redirect(backTo({ error: "Pick the property this reservation is for." }));

  const { data: property } = await supabase
    .from("properties_v")
    .select("client_id, name")
    .eq("id", property_id)
    .maybeSingle();

  if (!property) redirect(backTo({ error: "That property no longer exists." }));

  // Hand the ordinary booking writer an ordinary form.
  const booking = new FormData();
  booking.set("client_id", property.client_id);
  booking.append("property_ids", property_id);
  booking.set("check_in", (formData.get("check_in") as string) ?? "");
  booking.set("check_out", (formData.get("check_out") as string) ?? "");
  booking.set("guest_name", (formData.get("guest_name") as string) ?? "");
  booking.set("guest_phone", (formData.get("guest_phone") as string) ?? "");
  booking.set("sale_price", (formData.get("sale_price") as string) ?? "0");
  booking.set("advance_received", "0");
  booking.set("source", message.source ?? "other");
  booking.set("status", (formData.get("status") as string) || "confirmed");
  booking.set("notes", (formData.get("notes") as string) ?? "");
  // What lets a later cancellation email find this row.
  booking.set("ota_ref", message.external_ref ?? "");

  const result = await createBookingInline(booking);

  // A clash, a bad date range, a failed insert — all reported as the booking
  // form would report them, with the message left open to try again.
  if (result.error) redirect(backTo({ error: result.error }));

  await close(supabase, id, "applied", {
    booking_id: result.bookingId,
    property_id,
  });

  refresh();
  redirect(
    backTo({
      notice: `Booking added for ${property.name}. The owner has been notified.`,
    })
  );
}

/**
 * The channel says the guest cancelled. Runs the app's own cancel path, so the
 * nights reopen and both sides get the ordinary `booking_cancelled` notice.
 */
export async function applyCancellation(formData: FormData) {
  const id = (formData.get("id") as string) || "";
  const { supabase, message } = await loadMessage(id);

  if (!message) redirect(backTo({ error: "That message is gone." }));
  if (!message.booking_id) {
    redirect(
      backTo({
        error:
          "No booking here matches that confirmation code — nothing to cancel. Dismiss it, or cancel the booking by hand.",
      })
    );
  }

  const cancel = new FormData();
  cancel.set("id", message.booking_id);
  await cancelBooking(cancel);

  await close(supabase, id, "applied");

  refresh();
  redirect(backTo({ notice: "Booking cancelled and the nights reopened." }));
}

/**
 * Point an unmatched email at a property — and, where the property has that
 * channel's calendar connected, teach the feed the listing name so the next
 * email routes itself.
 */
export async function assignProperty(formData: FormData) {
  const id = (formData.get("id") as string) || "";
  const property_id = ((formData.get("property_id") as string) || "").trim();

  if (!property_id) redirect(backTo({ error: "Pick a property." }));

  const { supabase, message } = await loadMessage(id);
  if (!message) redirect(backTo({ error: "That message is gone." }));

  const listing = message.parsed?.listing?.trim() || null;

  await supabase
    .from("ota_messages")
    .update({ property_id, status: "pending" })
    .eq("id", id);

  // The mapping only has somewhere to live if this property already has the
  // channel's iCal link connected, because a feed row needs a URL.
  let remembered = false;

  if (listing && message.source) {
    const { data: feed } = await supabase
      .from("calendar_feeds")
      .select("id, listing_ref")
      .eq("property_id", property_id)
      .eq("source", message.source)
      .maybeSingle();

    if (feed && !feed.listing_ref) {
      await supabase.from("calendar_feeds").update({ listing_ref: listing }).eq("id", feed.id);
      remembered = true;
    }
  }

  refresh();
  redirect(
    backTo({
      notice: remembered
        ? `Mapped to this property, and future "${listing}" emails will route here automatically.`
        : "Mapped to this property. Connect this property's channel calendar to have future emails route themselves.",
    })
  );
}

/** Not ours, a duplicate, or handled elsewhere. The raw mail is kept either way. */
export async function dismissMessage(formData: FormData) {
  const id = (formData.get("id") as string) || "";
  const note = ((formData.get("admin_note") as string) || "").trim() || null;

  const { supabase, message } = await loadMessage(id);
  if (!message) redirect(backTo({ error: "That message is gone." }));

  await close(supabase, id, "ignored", { admin_note: note });

  refresh();
  redirect(backTo({ notice: "Dismissed. The email is still on file." }));
}

/**
 * "I have dealt with this."
 *
 * Date changes and payout notices are surfaced here but applied on the screens
 * that own them — the booking's own edit form, and the payouts page. Both
 * recompute money from the booking's snapshots in ways this queue must not
 * shortcut, so what the inbox offers is the detail and a tick, not a write.
 */
export async function markHandled(formData: FormData) {
  const id = (formData.get("id") as string) || "";
  const note = ((formData.get("admin_note") as string) || "").trim() || null;

  const { supabase, message } = await loadMessage(id);
  if (!message) redirect(backTo({ error: "That message is gone." }));

  await close(supabase, id, "applied", { admin_note: note });

  refresh();
  redirect(backTo({ notice: "Marked as handled." }));
}
