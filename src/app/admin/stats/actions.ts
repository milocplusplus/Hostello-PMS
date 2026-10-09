"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { describeCollectors, nightsBetween } from "@/lib/payout";
import { sourceLabel } from "@/lib/block-sources";
import { methodLabel } from "@/lib/owed";
import type { Cell, Sheet } from "@/lib/xlsx";

/**
 * The rows for the Stats page's Excel export. Admin only — the file carries
 * the Hostello/owner split. Guests are named but their phone numbers are left
 * out (the owner's choice). The browser turns the result into the file
 * (`src/lib/xlsx.ts`); nothing is stored, and the export is audit-logged.
 *
 * Dates: bookings by check-in, payments by the day they were filed, expenses
 * by the day they were incurred. Clients and units are listed whole.
 */

export type ExportRequest = { from: string; to: string; clientId: string | null; label: string };

type Result = { ok: true; sheets: Sheet[]; filename: string } | { ok: false; error: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 1000;

/** PostgREST caps a response at 1,000 rows; a year of bookings can pass that. */
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

export async function exportData(req: ExportRequest): Promise<Result> {
  await requireOwner();
  if (!DAY.test(req.from) || !DAY.test(req.to) || req.to < req.from) {
    return { ok: false, error: "Pick a valid date range." };
  }
  const clientId = req.clientId && /^[0-9a-f-]{36}$/i.test(req.clientId) ? req.clientId : null;
  const supabase = await createClient();

  try {
    // An empty match is no filter at all: every client.
    const clientFilter = clientId ? { client_id: clientId } : {};

    const [clients, units, bookings, toHostello, toOwner, expenses] = await Promise.all([
      all<Record<string, unknown>>((a, b) =>
        supabase
          .from("clients")
          .select("*")
          .match(clientId ? { id: clientId } : {})
          .order("name")
          .range(a, b)
      ),
      all<Record<string, unknown>>((a, b) =>
        supabase.from("properties").select("*").match(clientFilter).order("name").range(a, b)
      ),
      all<Record<string, unknown>>((a, b) =>
        supabase
          .from("bookings_v")
          .select(
            "id, client_id, guest_name, guests_count, check_in, check_out, is_short_stay, source, status, sale_price, nightly_price, advance_received, advance_received_by, balance_received_by, net_sale, hostello_share, client_payout, due_to_hostello, due_to_client, share_received, share_received_date, settled, settled_date, notes, created_at, booking_properties(property_id)"
          )
          .match(clientFilter)
          .gte("check_in", req.from)
          .lte("check_in", req.to)
          .order("check_in")
          .range(a, b)
      ),
      all<Record<string, unknown>>((a, b) =>
        supabase.from("client_payouts").select("*, client_payout_allocations(amount)")
          .match(clientFilter)
          .gte("created_at", `${req.from}T00:00:00+05:00`)
          .lte("created_at", `${req.to}T23:59:59.999+05:00`)
          .order("created_at")
          .range(a, b)
      ),
      all<Record<string, unknown>>((a, b) =>
        supabase.from("hostello_payouts").select("*, hostello_payout_allocations(amount)")
          .match(clientFilter)
          .gte("created_at", `${req.from}T00:00:00+05:00`)
          .lte("created_at", `${req.to}T23:59:59.999+05:00`)
          .order("created_at")
          .range(a, b)
      ),
      all<Record<string, unknown>>((a, b) =>
        supabase.from("expenses").select("*, expense_categories(name)")
          .match(clientFilter)
          .gte("incurred_on", req.from)
          .lte("incurred_on", req.to)
          .order("incurred_on")
          .range(a, b)
      ),
    ]);

    const clientName = new Map(clients.map((c) => [c.id as string, c.name as string]));
    // Units of a client filtered out are still named if an older booking used them.
    const unitName = new Map(units.map((u) => [u.id as string, u.name as string]));
    const who = (id: unknown) => clientName.get(id as string) ?? "";

    const allocated = (list: unknown) =>
      ((list as { amount: number }[] | null) ?? []).reduce((s, x) => s + Number(x.amount), 0);

    const sheets: Sheet[] = [
      {
        name: "Bookings",
        rows: [
          ["Check-in", "Check-out", "Nights", "Client", "Units", "Guest", "Guests", "Short stay", "Channel", "Status",
           "Sale price", "Per-night price", "Advance", "Money received by", "Net sale", "Hostello share", "Owner payout",
           "Owner owes Hostello", "Hostello owes owner", "Share received", "Share received on", "Owner paid", "Owner paid on", "Notes", "Entered"],
          ...bookings.map((b): Cell[] => [
            day(b.check_in), day(b.check_out),
            b.is_short_stay ? 0 : nightsBetween(b.check_in as string, b.check_out as string),
            who(b.client_id),
            ((b.booking_properties as { property_id: string }[]) ?? []).map((l) => unitName.get(l.property_id) ?? "").join(", "),
            (b.guest_name as string) ?? "", num(b.guests_count), Boolean(b.is_short_stay),
            sourceLabel(b.source as string) ?? (b.source as string), b.status as string,
            num(b.sale_price), num(b.nightly_price), num(b.advance_received),
            describeCollectors(b as Parameters<typeof describeCollectors>[0]), num(b.net_sale),
            num(b.hostello_share), num(b.client_payout), num(b.due_to_hostello), num(b.due_to_client),
            Boolean(b.share_received), day(b.share_received_date), Boolean(b.settled), day(b.settled_date),
            (b.notes as string) ?? "", day(b.created_at),
          ]),
        ],
      },
      {
        name: "Payments",
        rows: [
          ["Filed", "Direction", "Client", "Amount", "Method", "Reference", "Status", "Ruled on", "Allocated to bookings", "Note"],
          ...[
            ...toHostello.map((p) => ({ p, dir: "Owner → Hostello", note: p.admin_note, alloc: p.client_payout_allocations })),
            ...toOwner.map((p) => ({ p, dir: "Hostello → Owner", note: p.client_note, alloc: p.hostello_payout_allocations })),
          ]
            .sort((x, y) => String(x.p.created_at).localeCompare(String(y.p.created_at)))
            .map(({ p, dir, note, alloc }): Cell[] => [
              day(p.created_at), dir, who(p.client_id), num(p.amount), methodLabel(p.method as string),
              (p.reference as string) ?? "", p.status as string, day(p.reviewed_at), allocated(alloc),
              (note as string) ?? "",
            ]),
        ],
      },
      {
        name: "Owner expenses",
        rows: [
          ["Date", "Client", "Unit", "Category", "Amount", "Vendor", "Method", "Paid", "Due on", "Confirmed", "Note"],
          ...expenses.map((e): Cell[] => [
            day(e.incurred_on), who(e.client_id), e.property_id ? unitName.get(e.property_id as string) ?? "" : "",
            (e.expense_categories as { name: string } | null)?.name ?? "", num(e.amount), (e.vendor as string) ?? "",
            (e.method as string) ?? "", Boolean(e.paid), day(e.due_on), Boolean(e.confirmed), (e.note as string) ?? "",
          ]),
        ],
      },
      {
        name: "Clients",
        rows: [
          ["Client", "Email", "Phone", "Deal model", "Monthly fee", "Share %", "Deduction %", "OTA terms", "OTA share %",
           "Portal login", "Status", "Deactivated on", "Reason", "Added"],
          ...clients.map((c): Cell[] => [
            c.name as string, (c.contact_email as string) ?? "", (c.contact_phone as string) ?? "", c.deal_model as string,
            num(c.monthly_fee), num(c.share_percent), num(c.deduct_percent), (c.ota_model as string) ?? "",
            num(c.ota_share_percent), Boolean(c.owner_user_id), c.deactivated_at ? "Deactivated" : "Active",
            day(c.deactivated_at), (c.deactivated_note as string) ?? "", day(c.created_at),
          ]),
        ],
      },
      {
        name: "Units",
        rows: [
          ["Client", "Unit", "Type", "Location", "City", "Province", "Status", "Max guests", "Nightly rate",
           "Short-stay rate", "Stack rate", "Short-stay stack rate"],
          ...units.map((u): Cell[] => [
            who(u.client_id), u.name as string, u.type as string, (u.location as string) ?? "", (u.city as string) ?? "",
            (u.province as string) ?? "", u.status as string, num(u.max_guests), num(u.nightly_rate),
            num(u.short_stay_rate), num(u.stack_rate), num(u.short_stay_stack_rate),
          ]),
        ],
      },
    ];

    const scope = clientId ? who(clientId) || "one client" : "all clients";
    await supabase.rpc("log_export", {
      p_summary: `Excel export — ${req.label}, ${scope}: ${bookings.length} bookings, ${
        toHostello.length + toOwner.length
      } payments, ${expenses.length} expenses`,
      p_client_id: clientId,
    });

    const slug = `${clientId ? `${scope}-` : ""}${req.from}_to_${req.to}`.replace(/[^\w.-]+/g, "-");
    return { ok: true, sheets, filename: `hostello-export-${slug}.xlsx` };
  } catch (e) {
    const message = (e as { message?: string } | null)?.message;
    return { ok: false, error: message ?? "The export could not be read." };
  }
}
