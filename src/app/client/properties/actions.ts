"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notifyPropertyChangeRequested } from "@/lib/notify";
import { readRequestedChange, summariseChange } from "@/lib/property-requests";

function backTo(propertyId: string, error?: string) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  // The row's form re-opens on the property it was filed against, so a refusal
  // lands on the box that caused it rather than at the top of the list.
  params.set("open", propertyId);
  return `/client/properties?${params.toString()}`;
}

/**
 * The owner proposing a new capacity or asking price for one of their units.
 *
 * It writes a request and never the property: `properties` has no client INSERT
 * or UPDATE policy, and that is the point — an asking price is what a guest is
 * quoted. The insert policy is what proves the unit is theirs, so there is no
 * ownership check restated here.
 */
export async function requestPropertyChange(formData: FormData) {
  const propertyId = formData.get("property_id") as string;
  const note = (formData.get("note") as string)?.trim() || null;

  const asked = readRequestedChange(formData);
  if (!asked.ok) redirect(backTo(propertyId, asked.error));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // `properties_v`'s WHERE clause scopes this to their own units, so a forged
  // property id reads back nothing and the insert never happens.
  const { data: property } = await supabase
    .from("properties_v")
    .select("id, name, client_id, max_guests, nightly_rate")
    .eq("id", propertyId)
    .maybeSingle();

  if (!property) redirect(backTo(propertyId, "That isn't one of your properties."));

  const { data: request, error } = await supabase
    .from("property_change_requests")
    .insert({
      property_id: property.id,
      client_id: property.client_id,
      max_guests: asked.change.maxGuests,
      nightly_rate: asked.change.nightlyRate,
      note,
      requested_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !request) {
    // The partial unique index is the one failure worth naming: an owner with a
    // request already open is not told "duplicate key".
    const message = error?.code === "23505"
      ? "You already have a change waiting on this property. Withdraw it first."
      : (error?.message ?? "Could not file the request.");
    redirect(backTo(propertyId, message));
  }

  await notifyPropertyChangeRequested(supabase, {
    clientId: property.client_id,
    propertyId: property.id,
    propertyName: property.name,
    requestId: request.id,
    summary: summariseChange(asked.change, {
      maxGuests: property.max_guests == null ? null : Number(property.max_guests),
      nightlyRate: property.nightly_rate == null ? null : Number(property.nightly_rate),
    }),
  });

  revalidatePath("/client/properties");
  revalidatePath("/admin/property-requests");
  redirect("/client/properties");
}

/**
 * Taking an ask back. The delete policy is what limits this to their own and to
 * one nobody has ruled on — there is no UPDATE policy at all, so correcting a
 * request is withdrawing it and filing again.
 */
export async function withdrawPropertyChangeRequest(formData: FormData) {
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase.from("property_change_requests").delete().eq("id", id);

  if (error) redirect(backTo("", error.message));

  revalidatePath("/client/properties");
  revalidatePath("/admin/property-requests");
  redirect("/client/properties");
}
