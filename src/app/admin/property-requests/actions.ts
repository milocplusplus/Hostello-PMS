"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentUser, requireOwner } from "@/lib/auth";
import { notifyPropertyChangeReviewed } from "@/lib/notify";
import { summariseChange } from "@/lib/property-requests";

function backTo(error?: string) {
  return error ? `/admin/property-requests?error=${encodeURIComponent(error)}` : "/admin/property-requests";
}

/**
 * Ruling on one request, both ways.
 *
 * Applying writes the two columns onto `properties` and only then closes the
 * request, so a failed write leaves the ask open rather than claiming a change
 * that never landed. Declining writes nothing but the reason.
 *
 * `requireOwner()` rather than a hidden button: an action is its own endpoint,
 * and this one changes what a guest is quoted.
 */
async function reviewRequest(formData: FormData, applied: boolean) {
  await requireOwner();
  const reviewer = await currentUser();

  const id = formData.get("id") as string;
  const adminNote = (formData.get("admin_note") as string)?.trim() || null;

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("property_change_requests")
    .select("id, property_id, client_id, max_guests, nightly_rate, status")
    .eq("id", id)
    .maybeSingle();

  if (!request) redirect(backTo("That request is no longer there."));
  // Two admins on the queue at once, or a double-submitted form.
  if (request.status !== "pending") redirect(backTo("That request has already been ruled on."));

  const { data: property } = await supabase
    .from("properties_v")
    .select("id, name, max_guests, nightly_rate")
    .eq("id", request.property_id)
    .maybeSingle();

  if (!property) redirect(backTo("That property is no longer there."));

  const asked = {
    maxGuests: request.max_guests == null ? null : Number(request.max_guests),
    nightlyRate: request.nightly_rate == null ? null : Number(request.nightly_rate),
  };
  // Worded against what the unit held *before* the write, so the owner's notice
  // reads as the change they asked for and not as a pair of identical numbers.
  const summary = summariseChange(asked, {
    maxGuests: property.max_guests == null ? null : Number(property.max_guests),
    nightlyRate: property.nightly_rate == null ? null : Number(property.nightly_rate),
  });

  if (applied) {
    // Only the fields the request actually asked about — a null means "leave it
    // alone", and spreading a null here would blank a rate nobody mentioned.
    const patch: { max_guests?: number; nightly_rate?: number } = {};
    if (asked.maxGuests != null) patch.max_guests = asked.maxGuests;
    if (asked.nightlyRate != null) patch.nightly_rate = asked.nightlyRate;

    const { error } = await supabase.from("properties").update(patch).eq("id", request.property_id);
    if (error) redirect(backTo(error.message));
  }

  const { error: closeError } = await supabase
    .from("property_change_requests")
    .update({
      status: applied ? "applied" : "declined",
      admin_note: adminNote,
      reviewed_by: reviewer?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (closeError) redirect(backTo(closeError.message));

  await notifyPropertyChangeReviewed(supabase, {
    clientId: request.client_id,
    propertyId: request.property_id,
    propertyName: property.name,
    requestId: request.id,
    applied,
    summary,
    adminNote,
  });

  revalidatePath("/admin/property-requests");
  revalidatePath("/admin/clients/[id]", "page");
  revalidatePath("/client/properties");
  // The availability finder and the booking form quote `nightly_rate`.
  revalidatePath("/admin/availability");
  revalidatePath("/client", "layout");
  redirect(backTo());
}

export async function applyPropertyChangeRequest(formData: FormData) {
  await reviewRequest(formData, true);
}

export async function declinePropertyChangeRequest(formData: FormData) {
  await reviewRequest(formData, false);
}
