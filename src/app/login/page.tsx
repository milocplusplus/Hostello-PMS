import Link from "next/link";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-surface-0 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Wordmark */}
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
            <span className="text-ink-primary text-lg font-medium tracking-wide">
              HOSTELLO
            </span>
          </div>
          <p className="text-ink-muted text-xs tracking-wide">PROPERTY MANAGEMENT</p>
        </div>

        <form action={login} className="card p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs text-ink-secondary">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="bg-surface-2 border border-border-hairline rounded-md px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted outline-none focus:border-hostello-purple-mid transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs text-ink-secondary">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="bg-surface-2 border border-border-hairline rounded-md px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted outline-none focus:border-hostello-purple-mid transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-status-booked bg-status-booked/10 border border-status-booked/30 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="mt-2 rounded-md py-2.5 text-sm font-medium text-surface-0 transition-colors"
            style={{ backgroundColor: "var(--color-hostello-gold)" }}
          >
            Sign in
          </button>

          <Link
            href="/auth/forgot-password"
            className="text-center text-xs text-ink-muted hover:text-ink-secondary transition-colors"
          >
            Forgot your password?
          </Link>
        </form>

        <p className="text-center text-ink-muted text-xs mt-6">
          Access is provided by Hostello. Contact your admin if you need an account.
        </p>
      </div>
    </main>
  );
}
