import Link from "next/link";
import { login } from "./actions";
import { HostelloMark } from "@/components/shared/HostelloMark";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-in">
        {/* Wordmark */}
        <div className="flex flex-col items-center gap-3 mb-9">
          <span className="flex items-center justify-center w-14 h-14 rounded-2xl border border-border-hairline gradient-brand-subtle glow-purple">
            <HostelloMark size={30} />
          </span>
          <div className="flex flex-col items-center gap-1.5">
            <span className="display text-ink-primary text-xl font-semibold tracking-[0.16em]">
              HOSTELLO
            </span>
            <p className="eyebrow">Property management</p>
          </div>
        </div>

        <form action={login} className="card p-6 md:p-7 flex flex-col gap-4">
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
              className="field"
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
              className="field"
            />
          </div>

          {error && (
            <p className="text-xs text-status-booked bg-status-booked/10 border border-status-booked/30 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-gold mt-2 w-full py-2.5"
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
