import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_RECEIPT_BYTES, RECEIPT_ACCEPT, receiptExtension } from "./receipts";

/**
 * Guest ID cards — the CNIC / passport scans that go with a stay. A booking can
 * carry several (one per guest, or a front and a back), so the form field is
 * multiple and everything here works on a list.
 *
 * Same file rules and the same private-bucket-plus-signed-URL handling as
 * `receipts.ts`, but a different bucket and, unlike receipts, **both Hostello
 * and the owner may upload**.
 */
export const GUEST_ID_BUCKET = "guest-ids";

/** Enough for a couple of guests, front and back. */
export const MAX_GUEST_IDS_PER_UPLOAD = 10;

export const GUEST_ID_ACCEPT = RECEIPT_ACCEPT;

export type GuestId = {
  id: string;
  created_at: string;
  url: string | null;
  isPdf: boolean;
  /** Who attached it. An owner may only take back their own. */
  uploadedBy: string | null;
};

/** The files the form sent, empty when nothing was attached. */
export function guestIdFiles(formData: FormData): File[] {
  return formData
    .getAll("guest_ids")
    .filter((f): f is File => f instanceof File && f.size > 0);
}

/** Cheap checks worth doing before a booking is written. */
export function validateGuestIds(files: File[]): string | null {
  if (files.length > MAX_GUEST_IDS_PER_UPLOAD) {
    return `Attach at most ${MAX_GUEST_IDS_PER_UPLOAD} ID cards at a time.`;
  }
  for (const file of files) {
    if (file.size > MAX_RECEIPT_BYTES) {
      return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — keep each ID under 8 MB.`;
    }
    if (!receiptExtension(file.type)) {
      return `${file.name} is not a PNG, JPG, WebP or PDF.`;
    }
  }
  return null;
}

/** Upload the files, then record them. The rows are the index; storage holds the bytes. */
export async function attachGuestIds(
  supabase: SupabaseClient,
  args: { bookingId: string; files: File[]; uploadedBy: string | null }
): Promise<{ error: string | null }> {
  const invalid = validateGuestIds(args.files);
  if (invalid) return { error: invalid };
  if (args.files.length === 0) return { error: null };

  const uploaded: string[] = [];

  for (const file of args.files) {
    const path = `${args.bookingId}/${crypto.randomUUID()}.${receiptExtension(file.type)}`;
    const { error } = await supabase.storage
      .from(GUEST_ID_BUCKET)
      .upload(path, file, { contentType: file.type });

    if (error) {
      // Don't leave half an upload behind — either they all land or none do.
      if (uploaded.length > 0) await supabase.storage.from(GUEST_ID_BUCKET).remove(uploaded);
      return { error: error.message };
    }
    uploaded.push(path);
  }

  const { error } = await supabase.from("booking_guest_ids").insert(
    uploaded.map((storage_path) => ({
      booking_id: args.bookingId,
      storage_path,
      uploaded_by: args.uploadedBy,
    }))
  );

  if (error) {
    await supabase.storage.from(GUEST_ID_BUCKET).remove(uploaded);
    return { error: error.message };
  }

  return { error: null };
}

export async function listGuestIds(
  supabase: SupabaseClient,
  bookingId: string
): Promise<GuestId[]> {
  const { data } = await supabase
    .from("booking_guest_ids")
    .select("id, storage_path, created_at, uploaded_by")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: signed } = await supabase.storage
    .from(GUEST_ID_BUCKET)
    .createSignedUrls(
      rows.map((r) => r.storage_path),
      60 * 60
    );

  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl] as const));

  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    url: urls.get(r.storage_path) ?? null,
    isPdf: r.storage_path.endsWith(".pdf"),
    uploadedBy: r.uploaded_by,
  }));
}
