"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentUser, requireStaff } from "@/lib/auth";

const TICKS = {
  asked: "asked_at",
  guest_reviewed: "guest_reviewed_at",
  received: "review_received_at",
} as const;

/**
 * One of a review request's three ticks, set or taken back: the guest was
 * asked, we reviewed the guest, the guest's review came in.
 */
export async function tickReviewRequest(formData: FormData) {
  await requireStaff();
  const user = await currentUser();
  const id = String(formData.get("id") ?? "");
  const tick = String(formData.get("tick") ?? "") as keyof typeof TICKS;
  const on = formData.get("on") === "true";
  if (!(tick in TICKS)) return;

  const now = on ? new Date().toISOString() : null;
  const supabase = await createClient();
  await supabase
    .from("review_requests")
    .update(tick === "asked" ? { asked_at: now, asked_by: on ? (user?.id ?? null) : null } : { [TICKS[tick]]: now })
    .eq("id", id);

  revalidatePath("/admin/today");
  revalidatePath("/admin/listing-coach", "layout");
}
