import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/config";
import type { GalleryPhoto, PhotoRoom } from "@/lib/photo-rooms";

/**
 * A unit's photos. The only code that touches the two photo buckets.
 *
 * The gallery lives in the private `property-gallery` bucket: two files a
 * photo, `<client_id>/<property_id>/<uuid>.jpg` (full size) and `…-s.jpg` (the
 * screen copy), read through links signed for an hour. The cover is one
 * gallery photo, starred — a copy of its screen file sits in the public
 * `property-photos` bucket so every card and calendar row can show it without
 * signing anything. `set_property_cover()` in SQL is the only thing that
 * writes `properties.photo_path`.
 */
const COVER_BUCKET = "property-photos";
const GALLERY_BUCKET = "property-gallery";
// The browser has already resized both; these only stop a hand-made request.
const MAX_FULL_BYTES = 4 * 1024 * 1024;
const MAX_THUMB_BYTES = 1024 * 1024;

export function propertyPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${COVER_BUCKET}/${encoded}`;
}

/** The first unit's photo on a booking row's `booking_properties(properties(photo_path))`. */
export function firstUnitPhoto(bookingProperties: unknown): string | null {
  const rows = (bookingProperties as { properties: { photo_path?: string | null } | null }[] | null) ?? [];
  return rows.find((bp) => bp.properties?.photo_path)?.properties?.photo_path ?? null;
}

/** A unit's gallery in upload order, each photo with fresh signed links. */
export async function listPropertyPhotos(
  supabase: SupabaseClient,
  propertyId: string
): Promise<GalleryPhoto[]> {
  const { data } = await supabase
    .from("property_photos")
    .select("id, room, is_cover, full_path, thumb_path")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: signed } = await supabase.storage
    .from(GALLERY_BUCKET)
    .createSignedUrls(
      rows.flatMap((r) => [r.thumb_path, r.full_path]),
      60 * 60
    );
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl] as const));

  return rows.map((r) => ({
    id: r.id,
    room: r.room as PhotoRoom,
    isCover: r.is_cover,
    thumbUrl: urls.get(r.thumb_path) ?? null,
    fullUrl: urls.get(r.full_path) ?? null,
  }));
}

/**
 * Stores one photo's two files, then records it. RLS and the
 * `property_photos_prepare` trigger decide whether the caller may, keep the
 * files in the unit's own folder and stop the unit at 20.
 */
export async function addPropertyPhoto(
  supabase: SupabaseClient,
  args: { clientId: string; propertyId: string; room: PhotoRoom; full: File; thumb: File }
): Promise<{ id: string | null; error: string | null }> {
  if (args.full.type !== "image/jpeg" || args.thumb.type !== "image/jpeg") {
    return { id: null, error: "The photo did not arrive as a JPG." };
  }
  if (args.full.size > MAX_FULL_BYTES || args.thumb.size > MAX_THUMB_BYTES) {
    return { id: null, error: "That photo is too large." };
  }

  const base = `${args.clientId}/${args.propertyId}/${crypto.randomUUID()}`;
  const paths = { full: `${base}.jpg`, thumb: `${base}-s.jpg` };
  const bucket = supabase.storage.from(GALLERY_BUCKET);

  for (const key of ["full", "thumb"] as const) {
    const { error } = await bucket.upload(paths[key], args[key], { contentType: "image/jpeg" });
    if (error) {
      await bucket.remove([paths.full, paths.thumb]);
      return { id: null, error: error.message };
    }
  }

  const { data, error } = await supabase
    .from("property_photos")
    .insert({
      property_id: args.propertyId,
      client_id: args.clientId,
      room: args.room,
      full_path: paths.full,
      thumb_path: paths.thumb,
    })
    .select("id")
    .single();

  if (error || !data) {
    await bucket.remove([paths.full, paths.thumb]);
    return { id: null, error: error?.message ?? "Could not save the photo." };
  }
  return { id: data.id as string, error: null };
}

/**
 * Stars a gallery photo as the unit's cover: its screen copy goes into the
 * public bucket, the unit is pointed at it, and the cover it replaced is removed.
 */
export async function setPropertyCover(
  supabase: SupabaseClient,
  args: { clientId: string; propertyId: string; photoId: string }
): Promise<string | null> {
  const { data: photo } = await supabase
    .from("property_photos")
    .select("thumb_path")
    .eq("id", args.photoId)
    .eq("property_id", args.propertyId)
    .maybeSingle();
  if (!photo) return "That photo is no longer in the gallery.";

  const { data: file, error: readError } = await supabase.storage
    .from(GALLERY_BUCKET)
    .download(photo.thumb_path);
  if (readError || !file) return readError?.message ?? "Could not read the photo.";

  const path = `${args.clientId}/${args.propertyId}-${Date.now()}.jpg`;
  const covers = supabase.storage.from(COVER_BUCKET);
  const { error: uploadError } = await covers.upload(path, file, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) return uploadError.message;

  const { data: old, error } = await supabase.rpc("set_property_cover", {
    p_photo_id: args.photoId,
    p_path: path,
  });
  if (error) {
    await covers.remove([path]);
    return error.message;
  }
  if (typeof old === "string" && old) await covers.remove([old]);
  return null;
}

/**
 * Removes photos from one unit's gallery, rows first and then their files.
 * Removing the starred one leaves the unit without a cover (a trigger clears
 * `photo_path`), so its public copy goes too.
 */
export async function removePropertyPhotos(
  supabase: SupabaseClient,
  args: { propertyId: string; ids: string[]; coverPath: string | null }
): Promise<{ removed: number; coverGone: boolean; error: string | null }> {
  if (args.ids.length === 0) return { removed: 0, coverGone: false, error: null };

  const { data, error } = await supabase
    .from("property_photos")
    .delete()
    .in("id", args.ids)
    .eq("property_id", args.propertyId)
    .select("full_path, thumb_path, is_cover");
  if (error) return { removed: 0, coverGone: false, error: error.message };

  const rows = data ?? [];
  if (rows.length > 0) {
    await supabase.storage
      .from(GALLERY_BUCKET)
      .remove(rows.flatMap((r) => [r.full_path, r.thumb_path]));
  }
  const coverGone = rows.some((r) => r.is_cover);
  if (coverGone && args.coverPath) await supabase.storage.from(COVER_BUCKET).remove([args.coverPath]);

  return { removed: rows.length, coverGone, error: null };
}

/**
 * Deleting a unit cascades its photo rows away but not their files. Read the
 * paths before the delete, hand them back here after it.
 */
export async function galleryFilePaths(supabase: SupabaseClient, propertyId: string): Promise<string[]> {
  const { data } = await supabase
    .from("property_photos")
    .select("full_path, thumb_path")
    .eq("property_id", propertyId);
  return (data ?? []).flatMap((r) => [r.full_path as string, r.thumb_path as string]);
}

export async function removeUnitPhotoFiles(
  supabase: SupabaseClient,
  files: { gallery: string[]; cover: string | null }
) {
  if (files.gallery.length > 0) await supabase.storage.from(GALLERY_BUCKET).remove(files.gallery);
  if (files.cover) await supabase.storage.from(COVER_BUCKET).remove([files.cover]);
}
