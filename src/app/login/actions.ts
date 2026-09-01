"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/auth";

export async function login(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Enter your email and password.")}`);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Only a genuine credential mismatch gets the friendly message. Anything else
    // (bad API key, unconfirmed email, rate limit) is a real fault worth naming —
    // flattening them all into "wrong password" sends you hunting the wrong bug.
    const message =
      error.code === "invalid_credentials"
        ? "Incorrect email or password."
        : `Sign-in failed: ${error.message}`;
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?error=${encodeURIComponent("Something went wrong. Try again.")}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  // Both staff roles land in the same portal; it renames itself for whoever
  // opened it, and hides the split from ops.
  if (isStaffRole(profile?.role)) {
    redirect("/admin");
  }

  redirect("/client");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
