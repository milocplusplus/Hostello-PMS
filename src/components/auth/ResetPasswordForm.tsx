"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fieldLabel, fieldInput, primaryButton, primaryButtonStyle, errorBanner } from "@/lib/form-styles";

type Phase = "checking" | "ready" | "saving" | "invalid";

/**
 * Finishes a password recovery.
 *
 * This has to run in the browser: depending on the project's auth flow, Supabase
 * hands the recovery credential back as a URL *fragment* (`#access_token=…`), a
 * PKCE `?code=`, or a `?token_hash=`. A fragment never reaches the server, so a
 * Server Component could not see it. All three are handled here.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    const supabase = createClient();

    async function establishSession() {
      const url = new URL(window.location.href);
      const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));

      const linkError = fragment.get("error_description") ?? url.searchParams.get("error_description");
      if (linkError) {
        setError(linkError);
        setPhase("invalid");
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
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (error) throw error;
        } else {
          // No credential in the URL — only valid if they already have a session.
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            setPhase("invalid");
            return;
          }
        }

        // Don't leave the tokens sitting in the address bar / history.
        window.history.replaceState({}, "", "/auth/reset-password");
        setPhase("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "That link is no longer valid.");
        setPhase("invalid");
      }
    }

    establishSession();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Those two passwords don't match.");
      return;
    }

    setPhase("saving");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setPhase("ready");
      return;
    }

    // The recovery session is a real session, so send them straight in — "/" routes
    // to /admin or /client off their profile role.
    router.replace("/");
    router.refresh();
  }

  if (phase === "checking") {
    return <p className="card p-6 text-sm text-ink-secondary text-center">Checking your link…</p>;
  }

  if (phase === "invalid") {
    return (
      <div className="card p-6 flex flex-col gap-3 text-center">
        <p className="text-sm text-ink-primary">This reset link isn&apos;t valid any more.</p>
        <p className="text-xs text-ink-secondary">
          {error ?? "Links work once and expire after an hour."}
        </p>
        <Link
          href="/auth/forgot-password"
          className="text-xs text-hostello-gold hover:underline mt-1"
        >
          Send a new one →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 flex flex-col gap-4">
      <div>
        <h1 className="text-sm font-medium text-ink-primary">Choose a new password</h1>
        <p className="text-xs text-ink-secondary mt-1">At least 8 characters.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={fieldLabel}>
          New password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={fieldInput}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmation" className={fieldLabel}>
          Confirm new password
        </label>
        <input
          id="confirmation"
          type="password"
          required
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          className={fieldInput}
        />
      </div>

      {error && <p className={errorBanner}>{error}</p>}

      <button
        type="submit"
        disabled={phase === "saving"}
        className={`mt-1 ${primaryButton} disabled:opacity-60`}
        style={primaryButtonStyle}
      >
        {phase === "saving" ? "Saving…" : "Save and sign in"}
      </button>
    </form>
  );
}
