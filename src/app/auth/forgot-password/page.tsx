import Link from "next/link";
import { MailCheck } from "lucide-react";
import { requestPasswordReset } from "../actions";
import { fieldLabel, fieldInput, primaryButton, primaryButtonStyle, errorBanner } from "@/lib/form-styles";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  return (
    <main className="min-h-screen bg-surface-0 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-1 mb-10">
          <div className="flex items-center gap-2">
            <div
              aria-hidden
              className="w-6 h-6 rounded-sm"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-hostello-purple-mid), var(--color-hostello-purple))",
              }}
            />
            <span className="text-ink-primary text-lg font-medium tracking-wide">HOSTELLO</span>
          </div>
          <p className="text-ink-muted text-xs tracking-wide">PROPERTY MANAGEMENT</p>
        </div>

        {sent ? (
          <div className="card p-6 flex flex-col items-center gap-3 text-center">
            <MailCheck size={20} className="text-hostello-gold" />
            <p className="text-sm text-ink-primary">Check your inbox.</p>
            <p className="text-xs text-ink-secondary">
              If that address has an account, a reset link is on its way. The link works once and
              expires after an hour.
            </p>
          </div>
        ) : (
          <form action={requestPasswordReset} className="card p-6 flex flex-col gap-4">
            <div>
              <h1 className="text-sm font-medium text-ink-primary">Reset your password</h1>
              <p className="text-xs text-ink-secondary mt-1">
                We&apos;ll email you a link to set a new one.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className={fieldLabel}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                className={fieldInput}
              />
            </div>

            {error && <p className={errorBanner}>{error}</p>}

            <button type="submit" className={`mt-1 ${primaryButton}`} style={primaryButtonStyle}>
              Send reset link
            </button>
          </form>
        )}

        <p className="text-center text-ink-muted text-xs mt-6">
          <Link href="/login" className="hover:text-ink-secondary transition-colors">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
