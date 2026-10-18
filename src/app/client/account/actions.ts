"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentClient, currentUser } from "@/lib/auth";
import { sourceLabel } from "@/lib/block-sources";
import { nightsBetween } from "@/lib/payout";
import { RECEIPT_BUCKET } from "@/lib/receipts";
import { GUEST_ID_BUCKET } from "@/lib/guest-ids";
import { EXPENSE_BUCKET } from "@/lib/expenses";
import type { Cell, Sheet } from "@/lib/xlsx";

/**
 * A self-serve host's own data: take a copy, or take it all away. Both are the
 * host's alone — `hostOnly()` refuses a managed owner, and the middleware already
 * refuses every POST while an admin is viewing as a host.
 */

async function hostOnly() {
  const client = await currentClient();
  const user = await currentUser();
  if (!client || !user || client.account_type !== "host") return null;
  return { client, user };
}

// ── Export ───────────────────────────────────────────────────────────────────

type ExportResult = { ok: true; sheets: Sheet[]; filename: string } | { ok: false; error: string };

const PAGE = 1000;

/** PostgREST caps a response at 1,000 rows. */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let at = 0; ; at += PAGE) {
    const { data, error } = await page(at, at + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const day = (v: unknown): string | null => (typeof v === "string" ? v.slice(0, 10) : null);

export async function exportMyData(): Promise<ExportResult> {
  const me = await hostOnly();
  if (!me) return { ok: false, error: "This is for self-serve accounts." };
  const supabase = await createClient();
  const id = me.client.id;

  try {
    const [units, bookings, payments, expenses] = await Promise.all([
      all<Record<string, unknown>>((a, b) =>
        supabase.from("properties").select("*").eq("client_id", id).order("name").range(a, b)
      ),
      all<Record<string, unknown>>((a, b) =>
        supabase
          .from("bookings_v")
          .select(
            "id, guest_name, guest_phone, guests_count, check_in, check_out, is_short_stay, source, status, sale_price, nightly_price, advance_received, balance_paid_owner, balance_due, notes, created_at, booking_properties(property_id)"
          )
          .eq("client_id", id)
          .order("check_in")
          .range(a, b)
      ),
      all<Record<string, unknown>>((a, b) =>
        supabase
          .from("booking_payments")
          .select("booking_id, amount, method, paid_on, note")
          .eq("client_id", id)
          .order("paid_on")
          .range(a, b)
      ),
      all<Record<string, unknown>>((a, b) =>
        supabase
          .from("expenses")
          .select("*, expense_categories(name)")
          .eq("client_id", id)
          .order("incurred_on")
          .range(a, b)
      ),
    ]);

    const unitName = new Map(units.map((u) => [u.id as string, u.name as string]));
    const guestOf = new Map(bookings.map((b) => [b.id as string, (b.guest_name as string) ?? ""]));

    const sheets: Sheet[] = [
      {
        name: "Bookings",
        rows: [
          ["Check-in", "Check-out", "Nights", "Properties", "Guest", "Phone", "Guests", "Short stay", "Channel", "Status",
           "Price", "Per-night price", "Advance", "Paid after advance", "Still to pay", "Notes", "Entered"],
          ...bookings.map((b): Cell[] => [
            day(b.check_in), day(b.check_out),
            b.is_short_stay ? 0 : nightsBetween(b.check_in as string, b.check_out as string),
            ((b.booking_properties as { property_id: string }[]) ?? []).map((l) => unitName.get(l.property_id) ?? "").join(", "),
            (b.guest_name as string) ?? "", (b.guest_phone as string) ?? "", num(b.guests_count), Boolean(b.is_short_stay),
            sourceLabel(b.source as string) ?? (b.source as string), b.status as string,
            num(b.sale_price), num(b.nightly_price), num(b.advance_received), num(b.balance_paid_owner), num(b.balance_due),
            (b.notes as string) ?? "", day(b.created_at),
          ]),
        ],
      },
      {
        name: "Guest payments",
        rows: [
          ["Paid on", "Guest", "Amount", "Method", "Note"],
          ...payments.map((p): Cell[] => [
            day(p.paid_on), guestOf.get(p.booking_id as string) ?? "", num(p.amount), (p.method as string) ?? "", (p.note as string) ?? "",
          ]),
        ],
      },
      {
        name: "Expenses",
        rows: [
          ["Date", "Property", "Category", "Amount", "Vendor", "Method", "Paid", "Due on", "Confirmed", "Note"],
          ...expenses.map((e): Cell[] => [
            day(e.incurred_on), e.property_id ? unitName.get(e.property_id as string) ?? "" : "",
            (e.expense_categories as { name: string } | null)?.name ?? "", num(e.amount), (e.vendor as string) ?? "",
            (e.method as string) ?? "", Boolean(e.paid), day(e.due_on), Boolean(e.confirmed), (e.note as string) ?? "",
          ]),
        ],
      },
      {
        name: "Properties",
        rows: [
          ["Property", "Type", "Address", "City", "Province", "Status", "Sleeps", "Nightly price", "Short-stay price"],
          ...units.map((u): Cell[] => [
            u.name as string, u.type as string, (u.location as string) ?? "", (u.city as string) ?? "",
            (u.province as string) ?? "", u.status as string, num(u.max_guests), num(u.nightly_rate), num(u.short_stay_rate),
          ]),
        ],
      },
    ];

    return { ok: true, sheets, filename: `my-hostello-data-${new Date().toISOString().slice(0, 10)}.xlsx` };
  } catch (e) {
    return { ok: false, error: (e as { message?: string } | null)?.message ?? "Could not prepare the file." };
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function failed(message: string): never {
  redirect(`/client/account?error=${encodeURIComponent(message)}`);
}

/**
 * Deletes the host's account and everything in it. The files in storage go too —
 * SQL cannot reach them, so their paths are read first and removed after the rows
 * are gone (a failure then leaves orphan files, never rows pointing at nothing).
 * What they paid stays on record under their name and email. The audit log keeps
 * its entries: it is write-protected by design.
 */
export async function deleteMyAccount(formData: FormData) {
  const me = await hostOnly();
  if (!me) failed("This is for self-serve accounts.");
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") failed('Type DELETE in capitals to confirm.');

  const admin = createAdminClient();
  if (!admin) failed("Deleting an account is not available right now. Contact Hostello.");

  const clientId = me!.client.id;
  const userId = me!.user.id;

  // 1. Every file path that belongs to this account.
  const { data: bookingRows } = await admin!.from("bookings").select("id").eq("client_id", clientId);
  const bookingIds = (bookingRows ?? []).map((b) => b.id as string);

  const files = new Map<string, string[]>();
  const add = (bucket: string, paths: (string | null | undefined)[]) => {
    const list = files.get(bucket) ?? [];
    list.push(...paths.filter((p): p is string => Boolean(p)));
    files.set(bucket, list);
  };

  for (const ids of chunks(bookingIds, 100)) {
    const [receipts, guestIds] = await Promise.all([
      admin!.from("booking_receipts").select("storage_path").in("booking_id", ids),
      admin!.from("booking_guest_ids").select("storage_path").in("booking_id", ids),
    ]);
    add(RECEIPT_BUCKET, (receipts.data ?? []).map((r) => r.storage_path as string));
    add(GUEST_ID_BUCKET, (guestIds.data ?? []).map((r) => r.storage_path as string));
  }
  const [expenses, photos, units] = await Promise.all([
    admin!.from("expenses").select("receipt_path").eq("client_id", clientId),
    admin!.from("property_photos").select("full_path, thumb_path").eq("client_id", clientId),
    admin!.from("properties").select("photo_path").eq("client_id", clientId),
  ]);
  add(EXPENSE_BUCKET, (expenses.data ?? []).map((r) => r.receipt_path as string | null));
  add("property-gallery", (photos.data ?? []).flatMap((r) => [r.full_path as string, r.thumb_path as string]));
  add("property-photos", (units.data ?? []).map((r) => r.photo_path as string | null));

  // 2. The rows. Everything else cascades from the client.
  const { error: purgeError } = await admin!.rpc("purge_host_account", { p_client_id: clientId });
  if (purgeError) failed(`Could not delete the account: ${purgeError.message}`);

  // 3. The files. Best effort: the data is already gone.
  let leftOver = 0;
  for (const [bucket, paths] of files) {
    for (const group of chunks(paths, 100)) {
      const { error } = await admin!.storage.from(bucket).remove(group);
      if (error) leftOver += group.length;
    }
  }

  // 4. The login itself.
  await admin!.from("profiles").delete().eq("id", userId);
  const { error: loginError } = await admin!.auth.admin.deleteUser(userId);

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });

  const note =
    loginError || leftOver > 0
      ? " A few leftovers could not be removed; Hostello has been asked to finish the cleanup."
      : "";
  redirect(`/login?error=${encodeURIComponent(`Your account and its data have been deleted.${note}`)}`);
}
