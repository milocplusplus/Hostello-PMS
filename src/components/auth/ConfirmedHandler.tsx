"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Lands the confirmation-email link. Like the password reset, this has to run in
 * the browser: Supabase may return a `?code=`, a `?token_hash=` or a URL fragment,
 * and a fragment never reaches the server.
 */
export function ConfirmedHandler() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function finish() {
      const url = new URL(window.location.href);
      const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));

      const linkError = fragment.get("error_description") ?? url.searchParams.get("error_description");
      if (linkError) {
        setError(linkError.replace(/\+/g, " "));
        return;
      }

      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");

      try {
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "signup" });
          if (error) throw error;
        } else {
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            setError("This link is not valid.");
            return;
          }
        }
        window.history.replaceState({}, "", "/auth/confirmed");
        // "/" routes to the portal off the profile the sign-up trigger just made.
        router.replace("/");
        router.refresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        // The older kind of link only works in the browser that signed up. By the time it
        // fails, Supabase has usually already confirmed the address, so signing in is the way on.
        setError(
          /code verifier|verifier not found/i.test(message)
            ? "This link was opened in a different browser or app than the one you signed up in. Your email is probably confirmed already: try signing in with your email and password."
            : message || "That link is no longer valid."
        );
      }
    }

    finish();
  }, [router]);

  if (error) {
    return (
      <div className="card p-6 flex flex-col gap-3 text-center">
        <p className="text-sm text-ink-primary">We couldn&apos;t confirm your email.</p>
        <p className="text-xs text-ink-secondary">{error}</p>
        <Link href="/login" className="text-xs text-hostello-gold hover:underline mt-1">
          Try signing in →
        </Link>
      </div>
    );
  }

  return <p className="card p-6 text-sm text-ink-secondary text-center">Confirming your email…</p>;
}
