"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Sends the recovery email. The link lands on /auth/reset-password, which is the
 * only page that can finish the job — Supabase puts the recovery tokens in the URL
 * fragment, which never reaches the server.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();

  if (!email) {
    redirect(`/auth/forgot-password?error=${encodeURIComponent("Enter your email address.")}`);
  }

  const supabase = await createClient();
  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `https://${headerList.get("x-forwarded-host") ?? headerList.get("host")}`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset-password`,
  });

  // Rate limits and misconfigured SMTP are worth surfacing; "no such user" is not,
  // since that would turn this form into an account-enumeration oracle.
  if (error && error.code !== "user_not_found") {
    redirect(`/auth/forgot-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/auth/forgot-password?sent=1");
}
