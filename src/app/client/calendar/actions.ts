"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { announceBlockCreated, announceBlockRemoved } from "@/lib/block-events";
import { isManualBlockType } from "@/lib/block-sources";

function backTo(month: string, extra?: string) {
  const params = new URLSearchParams({ month });
  if (extra) params.set("error", extra);
  return `/client/calendar/block?${params.toString()}`;
}

export async function createClientCalendarBlock(formData: FormData) {
  const property_id = formData.get("property_id") as string;
  const month = (formData.get("month") as string) || "";
  const start_date = formData.get("start_date") as string;
  const end_date = formData.get("end_date") as string;
  const reason = (formData.get("reason") as string)?.trim() || null;
  // Anything but a type a person is allowed to pick falls back to a plain
  // block. `booked` is the sync's to write, never a form's.
  const blockTypeInput = formData.get("block_type");
  const block_type = isManualBlockType(blockTypeInput) ? (blockTypeInput as string) : "blocked";

  if (!property_id) {
    redirect(backTo(month, "Pick a property."));
  }
  if (!start_date || !end_date) {
    redirect(backTo(month, "Pick a start and end date."));
  }
  if (end_date < start_date) {
    redirect(backTo(month, "End date can't be before the start date."));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: overlapping } = await supabase
    .from("calendar_blocks")
    .select("id")
    .eq("property_id", property_id)
    .lte("start_date", end_date)
    .gte("end_date", start_date)
    .limit(1);

  if (overlapping && overlapping.length > 0) {
    redirect(backTo(month, "Those dates overlap an existing block."));
  }

  const { error } = await supabase.from("calendar_blocks").insert({
    property_id,
    start_date,
    end_date,
    block_type,
    notes: reason,
    created_by: user?.id ?? null,
  });

  if (error) {
    redirect(backTo(month, error.message));
  }

  await announceBlockCreated(supabase, {
    property_id,
    start_date,
    end_date,
    reason,
    blockType: block_type,
  });

  revalidatePath("/client/calendar");
  revalidatePath("/client/calendar/block");
  // The owner blocking their own dates is news for the admins.
  revalidatePath("/admin", "layout");
  redirect(`/client/calendar/block?month=${month}`);
}

export async function deleteClientCalendarBlock(formData: FormData) {
  const id = formData.get("id") as string;
  const month = (formData.get("month") as string) || "";

  const supabase = await createClient();

  // Read it before it is gone — the notification has to say which dates reopened.
  const { data: block } = await supabase
    .from("calendar_blocks")
    .select("id, property_id, start_date, end_date")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("calendar_blocks").delete().eq("id", id);

  if (error) {
    redirect(backTo(month, error.message));
  }

  if (block) await announceBlockRemoved(supabase, block);

  revalidatePath("/client/calendar");
  revalidatePath("/client/calendar/block");
  revalidatePath("/admin", "layout");
  redirect(`/client/calendar/block?month=${month}`);
}
