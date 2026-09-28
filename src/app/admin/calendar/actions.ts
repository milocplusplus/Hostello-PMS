"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { announceBlockCreated, announceBlockRemoved } from "@/lib/block-events";
import { isManualBlockType } from "@/lib/block-sources";
import { dateRange, notifyBulkSummary } from "@/lib/notify";

function backTo(month: string, params?: { error?: string; notice?: string }) {
  const search = new URLSearchParams({ month });
  if (params?.error) search.set("error", params.error);
  if (params?.notice) search.set("notice", params.notice);
  return `/admin/calendar/block?${search.toString()}`;
}

function refresh() {
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/calendar/block");
  revalidatePath("/client", "layout");
}

type UnitRow = { id: string; name: string; client_id: string };

/**
 * Block the same dates on one unit or many. A unit that already has a block
 * or a booking on those nights is skipped and named; the rest are blocked.
 * One unit keeps the single-block notice; many send one summary per owner.
 */
export async function createCalendarBlock(formData: FormData) {
  const month = (formData.get("month") as string) || "";
  const propertyIds = [
    ...new Set([...formData.getAll("property_ids"), formData.get("property_id")].filter(Boolean).map(String)),
  ];
  const start_date = formData.get("start_date") as string;
  const end_date = formData.get("end_date") as string;
  const reason = (formData.get("reason") as string)?.trim() || null;
  // Anything but a type a person is allowed to pick falls back to a plain
  // block. `booked` is the sync's to write, never a form's.
  const blockTypeInput = formData.get("block_type");
  const block_type = isManualBlockType(blockTypeInput) ? (blockTypeInput as string) : "blocked";

  if (propertyIds.length === 0) redirect(backTo(month, { error: "Pick at least one unit." }));
  if (!start_date || !end_date) redirect(backTo(month, { error: "Pick a start and end date." }));
  if (end_date < start_date) redirect(backTo(month, { error: "End date can't be before the start date." }));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: units }, { data: overlapping }, { data: links }] = await Promise.all([
    supabase.from("properties_v").select("id, name, client_id").in("id", propertyIds),
    supabase
      .from("calendar_blocks")
      .select("property_id")
      .in("property_id", propertyIds)
      .lte("start_date", end_date)
      .gte("end_date", start_date),
    supabase.from("booking_properties").select("booking_id, property_id").in("property_id", propertyIds),
  ]);

  // Nights are inclusive here; a stay holds check_in .. check_out - 1.
  const bookingIds = [...new Set((links ?? []).map((l) => l.booking_id))];
  const { data: stays } = bookingIds.length
    ? await supabase
        .from("bookings_v")
        .select("id, guest_name, check_in, check_out")
        .in("id", bookingIds)
        .neq("status", "cancelled")
        .lte("check_in", end_date)
        .gt("check_out", start_date)
    : { data: [] };

  const blockedUnits = new Set((overlapping ?? []).map((b) => b.property_id));
  const stayById = new Map((stays ?? []).map((s) => [s.id, s]));
  const bookedBy = new Map<string, string>();
  for (const l of links ?? []) {
    const stay = stayById.get(l.booking_id);
    if (stay && !bookedBy.has(l.property_id)) bookedBy.set(l.property_id, stay.guest_name ?? "a guest");
  }

  const free: UnitRow[] = [];
  const skipped: string[] = [];
  for (const u of (units ?? []) as UnitRow[]) {
    if (blockedUnits.has(u.id)) skipped.push(`${u.name} (already blocked)`);
    else if (bookedBy.has(u.id)) skipped.push(`${u.name} (booked by ${bookedBy.get(u.id)})`);
    else free.push(u);
  }

  if (free.length > 0) {
    const { error } = await supabase.from("calendar_blocks").insert(
      free.map((u) => ({
        property_id: u.id,
        start_date,
        end_date,
        block_type,
        notes: reason,
        created_by: user?.id ?? null,
      }))
    );
    if (error) redirect(backTo(month, { error: error.message }));

    if (free.length === 1) {
      await announceBlockCreated(supabase, {
        property_id: free[0].id,
        start_date,
        end_date,
        reason,
        blockType: block_type,
      });
    } else {
      const stamp = Date.now();
      for (const [clientId, list] of groupByClient(free)) {
        await notifyBulkSummary(supabase, {
          kind: "dates_blocked",
          category: "calendar",
          clientId,
          title: `${list.length} units ${block_type === "maintenance" ? "out of service" : "blocked"}`,
          body: `${list.map((u) => u.name).join(", ")} · ${dateRange(start_date, end_date)}${reason ? ` · ${reason}` : ""}`,
          eventKey: `bulk-block:${clientId}:${start_date}:${end_date}:${stamp}`,
        });
      }
    }
  }

  refresh();
  redirect(
    backTo(month, {
      ...(free.length ? { notice: `Blocked ${free.length} unit${free.length === 1 ? "" : "s"}.` } : {}),
      ...(skipped.length ? { error: `Skipped — ${skipped.join(", ")}.` } : {}),
    })
  );
}

/** One block (its own Unblock button) or several (the ticked ones). */
export async function deleteCalendarBlock(formData: FormData) {
  const month = (formData.get("month") as string) || "";
  const ids = [...new Set([...formData.getAll("ids"), formData.get("id")].filter(Boolean).map(String))];
  if (ids.length === 0) redirect(backTo(month, { error: "Tick the blocks to remove first." }));

  const supabase = await createClient();

  // Read them before they are gone — the notices say which dates reopened.
  const { data: blocks } = await supabase
    .from("calendar_blocks")
    .select("id, property_id, start_date, end_date, properties:properties_v(name, client_id)")
    .in("id", ids)
    .is("feed_id", null);

  const { error } = await supabase.from("calendar_blocks").delete().in("id", ids).is("feed_id", null);
  if (error) redirect(backTo(month, { error: error.message }));

  const rows = (blocks ?? []) as unknown as {
    id: string;
    property_id: string;
    start_date: string;
    end_date: string;
    properties: { name: string; client_id: string } | null;
  }[];

  if (rows.length === 1) {
    await announceBlockRemoved(supabase, rows[0]);
  } else {
    const stamp = Date.now();
    const byClient = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.properties) continue;
      byClient.set(r.properties.client_id, [...(byClient.get(r.properties.client_id) ?? []), r]);
    }
    for (const [clientId, list] of byClient) {
      await notifyBulkSummary(supabase, {
        kind: "dates_unblocked",
        category: "calendar",
        clientId,
        title: `${list.length} blocks removed`,
        body: list.map((r) => `${r.properties?.name} ${dateRange(r.start_date, r.end_date)}`).join(" · "),
        eventKey: `bulk-unblock:${clientId}:${stamp}`,
      });
    }
  }

  refresh();
  redirect(backTo(month, rows.length > 1 ? { notice: `Removed ${rows.length} blocks.` } : undefined));
}

function groupByClient(units: UnitRow[]): Map<string, UnitRow[]> {
  const map = new Map<string, UnitRow[]>();
  for (const u of units) map.set(u.client_id, [...(map.get(u.client_id) ?? []), u]);
  return map;
}
