"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";

/**
 * A host's side of their Airbnb emails. Both go through database functions that
 * check the caller is a self-serve host and that the row is theirs, so there is
 * no ownership logic to restate here.
 */

function back(params: Record<string, string>): never {
  redirect(`/client/emails?${new URLSearchParams(params).toString()}`);
}

export async function saveChannelEmail(formData: FormData) {
  const client = await currentClient();
  if (!client || client.account_type !== "host") redirect("/client");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_host_channel_email", {
    p_email: String(formData.get("channel_email") ?? ""),
  });
  if (error) back({ error: error.message });

  revalidatePath("/client/emails");
  back({ notice: "Saved." });
}

export async function dismissEmail(formData: FormData) {
  const client = await currentClient();
  if (!client || client.account_type !== "host") redirect("/client");

  const supabase = await createClient();
  const { error } = await supabase.rpc("host_dismiss_ota_message", { p_id: String(formData.get("id") ?? "") });
  if (error) back({ error: error.message });

  revalidatePath("/client/emails");
  revalidatePath("/client", "layout");
  back({});
}
