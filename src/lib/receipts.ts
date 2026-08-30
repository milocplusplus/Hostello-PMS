import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Token receipts — the screenshot that proves the advance was actually moved.
 * The bucket is private; files only ever reach a browser through a signed URL
 * minted here on the server.
 */
export const RECEIPT_BUCKET = "booking-receipts";

export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

export type ReceiptKind = "guest_to_hostello" | "hostello_to_client";

export const RECEIPT_KINDS: { value: ReceiptKind; label: string; short: string }[] = [
  { value: "guest_to_hostello", label: "Token received from guest", short: "From guest" },
  { value: "hostello_to_client", label: "Token paid to client", short: "To client" },
];

export function receiptKindLabel(kind: string) {
  return RECEIPT_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** Mime → extension. Doubles as the allow-list; the bucket enforces the same set. */
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export const RECEIPT_ACCEPT = Object.keys(EXTENSIONS).join(",");

/** The extension a mime type is stored under, or null if it isn't allowed.
 *  Shared with the payout-receipt bucket, which takes the same set of files. */
export function receiptExtension(mime: string): string | null {
  return EXTENSIONS[mime] ?? null;
}

export type Receipt = {
  id: string;
  kind: ReceiptKind;
  amount: number | null;
  created_at: string;
  url: string | null;
  isPdf: boolean;
};

/** The file the form sent, or null when nothing was attached. */
export function receiptFile(formData: FormData): File | null {
  const file = formData.get("receipt");
  return file instanceof File && file.size > 0 ? file : null;
}

export function receiptKind(formData: FormData): ReceiptKind {
  const kind = formData.get("receipt_kind");
  return RECEIPT_KINDS.some((k) => k.value === kind) ? (kind as ReceiptKind) : "guest_to_hostello";
}

/** Cheap checks worth doing before a booking is written. */
export function validateReceipt(file: File): string | null {
  if (file.size > MAX_RECEIPT_BYTES) {
    return `That receipt is ${(file.size / 1024 / 1024).toFixed(1)} MB — keep it under 8 MB.`;
  }
  if (!EXTENSIONS[file.type]) {
    return "Attach the receipt as a PNG, JPG, WebP or PDF.";
  }
  return null;
}

/** Upload the file, then record it. The row is the index; storage holds the bytes. */
export async function attachReceipt(
  supabase: SupabaseClient,
  args: {
    bookingId: string;
    file: File;
    kind: ReceiptKind;
    amount?: number | null;
    uploadedBy: string | null;
  }
): Promise<{ error: string | null; receiptId?: string }> {
  const invalid = validateReceipt(args.file);
  if (invalid) return { error: invalid };

  const path = `${args.bookingId}/${crypto.randomUUID()}.${EXTENSIONS[args.file.type]}`;

  const { error: uploadError } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, args.file, { contentType: args.file.type });

  if (uploadError) return { error: uploadError.message };

  // The id comes back so the caller can name the notification after this exact
  // receipt, which is what stops a retried upload notifying twice.
  const { data, error } = await supabase
    .from("booking_receipts")
    .insert({
      booking_id: args.bookingId,
      kind: args.kind,
      storage_path: path,
      amount: args.amount && args.amount > 0 ? args.amount : null,
      uploaded_by: args.uploadedBy,
    })
    .select("id")
    .single();

  if (error) {
    // Don't leave an orphan file behind if the row didn't land.
    await supabase.storage.from(RECEIPT_BUCKET).remove([path]);
    return { error: error.message };
  }

  return { error: null, receiptId: data.id };
}

export async function listReceipts(
  supabase: SupabaseClient,
  bookingId: string
): Promise<Receipt[]> {
  const { data } = await supabase
    .from("booking_receipts")
    .select("id, kind, storage_path, amount, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: signed } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrls(
      rows.map((r) => r.storage_path),
      60 * 60
    );

  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl] as const));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as ReceiptKind,
    amount: r.amount == null ? null : Number(r.amount),
    created_at: r.created_at,
    url: urls.get(r.storage_path) ?? null,
    isPdf: r.storage_path.endsWith(".pdf"),
  }));
}
