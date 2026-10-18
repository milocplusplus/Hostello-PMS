"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { PROPERTY_TYPES } from "@/lib/property-types";
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

// ── A self-serve host's own units and calendar links ─────────────────────────
// Managed owners cannot do any of this: their asking prices are Hostello's to
// set (see requestPropertyChange). RLS (`owns_host_client` / `owns_host_property`)
// is what refuses a managed owner or someone else's unit; the checks here only
// give a readable message first.

async function hostClient() {
  const client = await currentClient();
  if (!client || client.account_type !== "host") redirect("/client/properties");
  return client;
}

function optionalNumber(value: FormDataEntryValue | null, min = 0): number | null {
  const raw = (value as string | null)?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? n : null;
}

export async function saveHostProperty(formData: FormData) {
  const client = await hostClient();
  const id = ((formData.get("id") as string) || "").trim();
  const here = id ? `/client/properties/${id}/edit` : "/client/properties/new";
  const fail = (message: string): never => redirect(`${here}?error=${encodeURIComponent(message)}`);

  const name = (formData.get("name") as string)?.trim();
  const location = (formData.get("location") as string)?.trim();
  const type = formData.get("type") as string;
  const status = (formData.get("status") as string) === "inactive" ? "inactive" : "active";

  if (!name || !location) fail("Property name and address are required.");
  if (!PROPERTY_TYPES.some((t) => t.value === type)) fail("Pick a property type.");

  const values = {
    name,
    location,
    province: (formData.get("province") as string)?.trim() || null,
    city: (formData.get("city") as string)?.trim() || null,
    type,
    status,
    max_guests: optionalNumber(formData.get("max_guests"), 1),
    nightly_rate: optionalNumber(formData.get("nightly_rate")),
    short_stay_rate: optionalNumber(formData.get("short_stay_rate")),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("properties").update(values).eq("id", id).eq("client_id", client.id)
    : await supabase.from("properties").insert({ ...values, client_id: client.id });

  // The plan limit is a database rule; its message is already written for the host.
  if (error) fail(error.message);

  revalidatePath("/client", "layout");
  redirect("/client/properties");
}

function calendarHere(propertyId: string, params: Record<string, string>) {
  return `/client/properties/${propertyId}/calendar?${new URLSearchParams(params).toString()}`;
}

export async function addHostCalendarLink(formData: FormData) {
  await hostClient();
  const propertyId = (formData.get("property_id") as string) || "";
  const url = ((formData.get("url") as string) || "").trim();
  const source = (formData.get("source") as string) === "booking_com" ? "booking_com" : "airbnb";

  if (!url) redirect(calendarHere(propertyId, { error: "Paste the calendar link." }));

  const supabase = await createClient();
  const user = await currentUser();
  const { error } = await supabase
    .from("calendar_feeds")
    .insert({ property_id: propertyId, url, source, created_by: user?.id ?? null });

  if (error) {
    const message = error.code === "23505" ? "That link is already connected to this property." : error.message;
    redirect(calendarHere(propertyId, { error: message }));
  }

  revalidatePath("/client", "layout");
  // The every-minute sync picks it up; there is no waiting on this page.
  redirect(calendarHere(propertyId, { notice: "Connected. Your dates appear within a minute." }));
}

export async function removeHostCalendarLink(formData: FormData) {
  await hostClient();
  const propertyId = (formData.get("property_id") as string) || "";
  const id = (formData.get("id") as string) || "";
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_feeds").delete().eq("id", id);
  if (error) redirect(calendarHere(propertyId, { error: error.message }));
  revalidatePath("/client", "layout");
  redirect(calendarHere(propertyId, { notice: "Disconnected. The dates it brought in are removed." }));
}

export async function createHostCalendarExport(formData: FormData) {
  await hostClient();
  const propertyId = (formData.get("property_id") as string) || "";
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_exports").insert({ property_id: propertyId });
  if (error && error.code !== "23505") redirect(calendarHere(propertyId, { error: error.message }));
  revalidatePath(`/client/properties/${propertyId}/calendar`);
  redirect(calendarHere(propertyId, { notice: "Link created. Paste it into Airbnb to publish these dates." }));
}
