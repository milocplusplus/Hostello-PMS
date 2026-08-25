"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Admins read the same rows the clients do, so the admin unread mark lives in
 * its own column. RLS (`notifications: admin full access`) scopes both writes.
 */
export async function markAllReadAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ admin_read_at: new Date().toISOString() })
    .is("admin_read_at", null);

  revalidatePath("/admin", "layout");
}

export async function markOneReadAdmin(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ admin_read_at: new Date().toISOString() })
    .eq("id", id)
    .is("admin_read_at", null);

  revalidatePath("/admin", "layout");
}
