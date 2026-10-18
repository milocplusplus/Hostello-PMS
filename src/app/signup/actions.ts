"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function back(message: string): never {
  redirect(`/signup?error=${encodeURIComponent(message)}`);
}

/**
 * Self-serve host sign-up. The account itself (profile, client record, trial) is
 * made by the `handle_host_signup` trigger once the email is confirmed; this only
 * hands Auth the person's details. The trigger re-checks that sign-ups are open and
 * the terms were accepted, because Auth's own API is public.
 */
export async function signUp(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const accepted = formData.get("terms") === "on";

  if (!fullName) back("Enter your name.");
  if (!email) back("Enter your email address.");
  if (password.length < 8) back("Use at least 8 characters for your password.");
  if (!accepted) back("Accept the terms and privacy policy to continue.");

  const supabase = await createClient();

  const { data: open } = await supabase.rpc("host_signup_open");
  if (!open) back("Sign-ups are not open yet.");

  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `https://${headerList.get("x-forwarded-host") ?? headerList.get("host")}`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirmed`,
      data: {
        signup_kind: "host",
        full_name: fullName,
        phone,
        terms_accepted: "true",
      },
    },
  });

  if (error) {
    back(
      error.code === "weak_password"
        ? "That password is too easy to guess. Try a longer or less common one."
        : error.message
    );
  }

  // Email confirmation on: no session yet, the link in the inbox finishes it.
  // Confirmation off: signed in already.
  if (data.session) redirect("/");
  redirect("/signup?sent=1");
}
