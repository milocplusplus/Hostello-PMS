"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Operations accounts.
 *
 * Making a sign-in is something no ordinary session can do, and this app already
 * had an answer for it: `create_client_login` — a SECURITY DEFINER function that
 * checks the caller is the owner and writes `auth.users` itself. These three do
 * the same for ops, so no service-role key is needed in the web app and the
 * authorisation lives next to the data, in SQL.
 *
 * Removing access bans the account rather than deleting it: a deleted user takes
 * their `entered_by` and `actor_user_id` history with them, and the point of an
 * audit trail is that it survives someone leaving.
 */

function back(message: string, key: "error" | "notice" = "error"): never {
  redirect(`/admin/staff?${key}=${encodeURIComponent(message)}`);
}

export async function inviteOpsUser(formData: FormData) {
  await requireOwner();

  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const fullName = (formData.get("full_name") as string)?.trim();
  const password = formData.get("password") as string;

  if (!email || !password) back("Enter an email and a temporary password.");
  if (password.length < 8) back("The temporary password needs at least 8 characters.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_ops_login", {
    p_email: email,
    p_password: password,
    p_full_name: fullName || null,
  });

  if (error) back(error.message);

  revalidatePath("/admin/staff");
  back(`${email} can now sign in. Give them the password yourself.`, "notice");
}

export async function setOpsAccess(formData: FormData) {
  await requireOwner();

  const id = formData.get("id") as string;
  const blocked = formData.get("blocked") === "true";
  if (!id) back("No account named.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_ops_access", {
    p_user_id: id,
    p_blocked: blocked,
  });

  if (error) back(error.message);

  revalidatePath("/admin/staff");
  back(blocked ? "Access removed." : "Access restored.", "notice");
}

export async function resetOpsPassword(formData: FormData) {
  await requireOwner();

  const id = formData.get("id") as string;
  const password = formData.get("password") as string;
  if (!id) back("No account named.");
  if (!password || password.length < 8) back("The new password needs at least 8 characters.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_ops_password", {
    p_user_id: id,
    p_password: password,
  });

  if (error) back(error.message);

  revalidatePath("/admin/staff");
  back("Password changed, and their old session is signed out. Pass it on yourself.", "notice");
}
