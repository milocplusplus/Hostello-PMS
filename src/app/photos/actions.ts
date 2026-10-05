"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { currentProfile, isStaffRole } from "@/lib/auth";
import { isPhotoRoom } from "@/lib/photo-rooms";
import { addPropertyPhoto, removePropertyPhotos, setPropertyCover } from "@/lib/property-photos";
import { notifyPropertyPhotosAdded, notifyPropertyPhotosRemoved } from "@/lib/notify";

/**
 * The gallery's writes, shared by both portals the way the notification
 * actions are. Who may do what is decided in the database — RLS on
 * `property_photos`, the storage policies and `set_property_cover()` — so
 * staff and the unit's owner run the same code. An admin viewing as an owner
 * never gets here: the middleware refuses every POST to `/client`.
 */
type Result = { error: string | null };

/** `properties_v` returns every unit to staff and only their own to an owner. */
async function unit(supabase: SupabaseClient, propertyId: string) {
  const { data } = await supabase
    .from("properties_v")
    .select("id, name, client_id, photo_path")
    .eq("id", propertyId)
    .maybeSingle();
  return data as { id: string; name: string; client_id: string; photo_path: string | null } | null;
}

/**
 * One photo per call — the browser has already made the full-size file and the
 * screen copy — so a batch never has to fit in one request. A unit with no
 * cover takes its first photo as one; `cover=1` asks for it outright.
 */
export async function uploadPropertyPhoto(formData: FormData): Promise<Result> {
  const propertyId = String(formData.get("property_id") ?? "");
  const room = String(formData.get("room") ?? "");
  const full = formData.get("full");
  const thumb = formData.get("thumb");

  if (!isPhotoRoom(room)) return { error: "Pick a room for the photo." };
  if (!(full instanceof File) || !(thumb instanceof File)) return { error: "Choose a photo." };

  const supabase = await createClient();
  const property = await unit(supabase, propertyId);
  if (!property) return { error: "That unit isn't yours to add photos to." };

  const added = await addPropertyPhoto(supabase, {
    clientId: property.client_id,
    propertyId: property.id,
    room,
    full,
    thumb,
  });
  if (added.error || !added.id) return { error: added.error ?? "Could not save the photo." };

  if (!property.photo_path || formData.get("cover") === "1") {
    await setPropertyCover(supabase, {
      clientId: property.client_id,
      propertyId: property.id,
      photoId: added.id,
    });
  }
  return { error: null };
}

/** Called once after a batch: the one notice it earns, and the refresh. */
export async function finishPhotoUpload(propertyId: string, added: number, batch: string) {
  const supabase = await createClient();
  const [property, profile] = await Promise.all([unit(supabase, propertyId), currentProfile()]);

  if (property && added > 0 && !isStaffRole(profile?.role)) {
    await notifyPropertyPhotosAdded(supabase, {
      clientId: property.client_id,
      propertyId: property.id,
      propertyName: property.name,
      count: added,
      batch: batch.slice(0, 64),
    });
  }
  // The cover shows on cards, calendars and dashboards in both portals.
  revalidatePath("/", "layout");
}

export async function deletePropertyPhotos(propertyId: string, ids: string[]): Promise<Result> {
  const supabase = await createClient();
  const [property, profile] = await Promise.all([unit(supabase, propertyId), currentProfile()]);
  if (!property) return { error: "That unit isn't yours to change." };

  const result = await removePropertyPhotos(supabase, {
    propertyId: property.id,
    ids,
    coverPath: property.photo_path,
  });
  if (result.error) return { error: result.error };

  if (result.removed > 0 && profile?.role !== "admin") {
    await notifyPropertyPhotosRemoved(supabase, {
      clientId: property.client_id,
      propertyId: property.id,
      propertyName: property.name,
      count: result.removed,
      by: isStaffRole(profile?.role) ? (profile?.full_name ?? "ops") : "the owner",
      photoId: ids[0],
    });
  }
  revalidatePath("/", "layout");
  return { error: null };
}

export async function starPropertyPhoto(propertyId: string, photoId: string): Promise<Result> {
  const supabase = await createClient();
  const property = await unit(supabase, propertyId);
  if (!property) return { error: "That unit isn't yours to change." };

  const error = await setPropertyCover(supabase, {
    clientId: property.client_id,
    propertyId: property.id,
    photoId,
  });
  revalidatePath("/", "layout");
  return { error };
}
