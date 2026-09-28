"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/auth";
import { deliverAuditAlerts } from "@/lib/push";
import { VIEW_AS_COOKIE, VIEW_AS_PATH } from "@/lib/view-as";

/** A "view as owner" left open must never follow the next person to sign in. */
async function endViewAs() {
  (await cookies()).set(VIEW_AS_COOKIE, "", { path: VIEW_AS_PATH, maxAge: 0 });
}

export async function login(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Enter your email and password.")}`);
  }

  await endViewAs();
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Auth keeps no record of a wrong password, so the audit log is told here.
    // Best-effort: failing to log must not change what the person sees.
    if (error.code === "invalid_credentials") {
      await supabase.rpc("log_sign_in_failed", { p_email: email }).then(
        () => deliverAuditAlerts(),
        () => undefined
      );
    }

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

  // The browser this session belongs to, for the device lists on Staff and the
  // client page. Supabase's own record says "Vercel Edge Functions", because
  // the server is what refreshes the token. Best-effort, never blocks sign-in.
  const h = await headers();
  await supabase
    .rpc("record_session_device", {
      p_user_agent: h.get("user-agent") ?? "",
      p_ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim(),
    })
    .then(
      () => undefined,
      () => undefined
    );

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
  await endViewAs();
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
