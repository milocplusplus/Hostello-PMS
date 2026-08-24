"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markAllRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();
  if (!clientRecord) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("client_id", clientRecord.id)
    .is("read_at", null);

  revalidatePath("/client/notifications");
  revalidatePath("/client");
}

export async function markOneRead(formData: FormData) {
  const id = formData.get("id") as string;

  const supabase = await createClient();
  // RLS restricts this to the caller's own notifications.
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);

  revalidatePath("/client/notifications");
  revalidatePath("/client");
}
