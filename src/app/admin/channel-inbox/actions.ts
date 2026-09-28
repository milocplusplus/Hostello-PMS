"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { createBookingInline, cancelBooking, editBookingInline } from "@/app/admin/bookings/actions";
import { sourceLabel } from "@/lib/block-sources";
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
  if (!property_id) redirect(backTo({ error: "Pick the unit this reservation is for." }));

  const { data: property } = await supabase
    .from("properties_v")
    .select("client_id, name, airbnb_listing_id, booking_hotel_id")
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
  booking.set("guests_count", (formData.get("guests_count") as string) ?? "");
  booking.set("notes", (formData.get("notes") as string) ?? "");
  // What lets a later cancellation email find this row.
  booking.set("ota_ref", message.external_ref ?? "");
  // The "Reserved" bar the channel's calendar already imported for this stay.
  // The booking write honours it only on the unit being booked, over nights it
  // actually holds — so a reviewer who picks a different unit just gets an
  // ordinary clash check.
  booking.set("from_block", (formData.get("from_block") as string) ?? "");

  const result = await createBookingInline(booking);

  // A clash, a bad date range, a failed insert — all reported as the booking
  // form would report them, with the message left open to try again.
  if (result.error) redirect(backTo({ error: result.error }));

  await close(supabase, id, "applied", {
    booking_id: result.bookingId,
    property_id,
  });

  const linked = await linkListing(supabase, message, property_id, property);

  refresh();
  redirect(
    backTo({
      notice:
        `Booking added for ${property.name}. The owner has been notified.` +
        (linked ? ` Future ${sourceLabel(message.source)} emails for this listing will find ${property.name} on their own.` : ""),
    })
  );
}

/**
 * Teach the unit the channel's number for it, the first time a mail for it is
 * approved — so the next mail routes itself.
 *
 * Only ever fills a blank: an id already set was set by someone on purpose,
 * and a reviewer picking a unit for one Booking.com stay must not rewrite it.
 * Admin-only by RLS (ops cannot update `properties`); for ops this quietly
 * does nothing and the mail is still approved.
 */
async function linkListing(
  supabase: Awaited<ReturnType<typeof createClient>>,
  message: MessageRow,
  propertyId: string,
  property: { airbnb_listing_id: string | null; booking_hotel_id: string | null }
): Promise<boolean> {
  const listingId = message.parsed?.listing_id?.trim();
  if (!listingId) return false;

  const column =
    message.source === "airbnb" ? "airbnb_listing_id" : message.source === "booking_com" ? "booking_hotel_id" : null;
  if (!column || property[column]) return false;

  const { data } = await supabase
    .from("properties")
    .update({ [column]: listingId })
    .eq("id", propertyId)
    .is(column, null)
    .select("id");

  return (data ?? []).length > 0;
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

  // `cancelBooking` reports nothing back, and an ops login may be refused the
  // cancel by Settings — so look, rather than file the mail as done over a
  // booking that is still live.
  const { data: after } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", message.booking_id)
    .maybeSingle();
  if (after?.status !== "cancelled") {
    redirect(backTo({ error: "The booking could not be cancelled. Ask the owner to cancel it." }));
  }

  await close(supabase, id, "applied");

  refresh();
  redirect(backTo({ notice: "Booking cancelled and the nights reopened." }));
}

/**
 * The channel changed a reservation: apply the new dates (and the price, if
 * the reviewer changed it) through the booking's ordinary edit, so the split
 * is recomputed from the terms the booking was made on.
 *
 * Airbnb's "reservation updated" mail carries neither dates nor price — the
 * form comes pre-filled from the channel's calendar, and the price from the
 * booking as it stands.
 */
export async function applyAlteration(formData: FormData) {
  const id = (formData.get("id") as string) || "";
  const { supabase, message } = await loadMessage(id);

  if (!message) redirect(backTo({ error: "That message is gone." }));
  if (!message.booking_id) redirect(backTo({ error: "No booking matches this change." }));

  const patch: Record<string, string> = {
    check_in: (formData.get("check_in") as string) ?? "",
    check_out: (formData.get("check_out") as string) ?? "",
  };
  const price = ((formData.get("sale_price") as string) ?? "").trim();
  if (price) {
    patch.price_mode = "total";
    patch.sale_price = price;
  }

  const result = await editBookingInline(message.booking_id, patch);
  if (result.error) redirect(backTo({ error: result.error }));

  await close(supabase, id, "applied");

  refresh();
  redirect(backTo({ notice: "Change applied. The owner has been told the new dates." }));
}

/**
 * The channel accepted a request that is already here as a tentative booking.
 * Confirming goes through the edit too: a tentative stay earns Hostello
 * nothing, so the split has to be worked out again now that it is real.
 */
export async function confirmRequest(formData: FormData) {
  const id = (formData.get("id") as string) || "";
  const { supabase, message } = await loadMessage(id);

  if (!message) redirect(backTo({ error: "That message is gone." }));
  if (!message.booking_id) redirect(backTo({ error: "No booking matches this confirmation." }));

  const patch: Record<string, string> = { status: "confirmed" };
  const price = ((formData.get("sale_price") as string) ?? "").trim();
  if (price) {
    patch.price_mode = "total";
    patch.sale_price = price;
  }

  const result = await editBookingInline(message.booking_id, patch);
  if (result.error) redirect(backTo({ error: result.error }));

  await close(supabase, id, "applied");

  refresh();
  redirect(backTo({ notice: "Booking confirmed. The owner has been told." }));
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
 * For payout notices, which are surfaced here but worked on Settlements: money
 * that has moved is recorded where it is allocated, so what the inbox offers
 * is the detail and a tick, not a write.
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
