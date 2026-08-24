"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
    block_type: "blocked",
    notes: reason,
    created_by: user?.id ?? null,
  });

  if (error) {
    redirect(backTo(month, error.message));
  }

  revalidatePath("/client/calendar");
  revalidatePath("/client/calendar/block");
  redirect(`/client/calendar/block?month=${month}`);
}

export async function deleteClientCalendarBlock(formData: FormData) {
  const id = formData.get("id") as string;
  const month = (formData.get("month") as string) || "";

  const supabase = await createClient();
  const { error } = await supabase.from("calendar_blocks").delete().eq("id", id);

  if (error) {
    redirect(backTo(month, error.message));
  }

  revalidatePath("/client/calendar");
  revalidatePath("/client/calendar/block");
  redirect(`/client/calendar/block?month=${month}`);
}
