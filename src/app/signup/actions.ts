"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createAuthClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

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

  // The confirmation link is opened wherever the person reads their email — often a
  // phone, or a mail app's own browser — not necessarily where they signed up. The
  // usual cookie-based (PKCE) link needs the very same browser, so this one request
  // uses the implicit flow: the link carries the session itself, and the landing
  // page (`ConfirmedHandler`) turns it into a sign-in on any device.
  const authOnly = createAuthClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await authOnly.auth.signUp({
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
    if (error.code === "weak_password") {
      // Auth says which rules the password broke; say them in plain words.
      const reasons = (error as { reasons?: string[] }).reasons ?? [];
      const why = [
        reasons.includes("length") && "use more characters (12 or more is best)",
        reasons.includes("characters") && "mix upper and lower case letters, numbers and symbols",
        reasons.includes("pwned") && "this one has appeared in known data leaks, so choose a different one",
      ].filter(Boolean);
      back(
        why.length > 0
          ? `That password was not accepted: ${why.join("; ")}.`
          : "That password is too easy to guess. Try a longer one with letters, numbers and a symbol."
      );
    }
    back(error.message);
  }

  // Email confirmation on: no session yet, the link in the inbox finishes it.
  // Confirmation off: the account is live, so sign in here (the request above kept no cookies).
  if (data.session) {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    redirect(signInError ? "/login" : "/");
  }
  redirect("/signup?sent=1");
}
