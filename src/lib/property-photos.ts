import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/config";

/**
 * A unit's cover photo. The only code that touches the `property-photos`
 * bucket. The bucket is public-read, so a photo's URL is built, not signed;
 * writing goes through `set_property_photo()` in SQL, which checks the caller
 * is the admin or the unit's owner and keeps the path in that client's folder.
 */
const BUCKET = "property-photos";
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 8 * 1024 * 1024;

export function propertyPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encoded}`;
}

export function validatePropertyPhoto(file: File): string | null {
  if (!TYPES[file.type]) return "Use a JPG, PNG or WebP photo.";
  if (file.size > MAX_BYTES) return "That photo is over 8 MB.";
  return null;
}

/** Uploads a new photo, points the unit at it, then removes the one it replaced. */
export async function setPropertyPhoto(
  supabase: SupabaseClient,
  { clientId, propertyId, file }: { clientId: string; propertyId: string; file: File }
): Promise<string | null> {
  const invalid = validatePropertyPhoto(file);
  if (invalid) return invalid;

  const path = `${clientId}/${propertyId}-${Date.now()}.${TYPES[file.type]}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (uploadError) return uploadError.message;

  const { data: old, error } = await supabase.rpc("set_property_photo", {
    p_property_id: propertyId,
    p_path: path,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return error.message;
  }
  if (typeof old === "string" && old) await supabase.storage.from(BUCKET).remove([old]);
  return null;
}

/** Clears the unit's photo; it falls back to its colour tile. */
export async function removePropertyPhoto(
  supabase: SupabaseClient,
  propertyId: string
): Promise<string | null> {
  const { data: old, error } = await supabase.rpc("set_property_photo", {
    p_property_id: propertyId,
    p_path: null,
  });
  if (error) return error.message;
  if (typeof old === "string" && old) await supabase.storage.from(BUCKET).remove([old]);
  return null;
}

/** The first unit's photo on a booking row's `booking_properties(properties(photo_path))`. */
export function firstUnitPhoto(bookingProperties: unknown): string | null {
  const rows = (bookingProperties as { properties: { photo_path?: string | null } | null }[] | null) ?? [];
  return rows.find((bp) => bp.properties?.photo_path)?.properties?.photo_path ?? null;
}
