import Link from "next/link";
import { Lock, Mail } from "lucide-react";
import { login } from "./actions";
import { HostelloMark } from "@/components/shared/HostelloMark";
import { SubmitButton } from "@/components/shared/Busy";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const field = "field w-full h-12 pl-11 rounded-2xl";

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Slow-moving light behind the card: the first thing anyone sees */}
      <span aria-hidden className="orb w-[26rem] h-[26rem] -top-24 -left-32 bg-hostello-purple-glow/45" />
      <span
        aria-hidden
        className="orb w-[22rem] h-[22rem] top-1/3 -right-40 bg-hostello-magenta/35"
        style={{ animationDelay: "-6s" }}
      />
      <span
        aria-hidden
        className="orb w-[20rem] h-[20rem] -bottom-28 left-1/4 bg-hostello-gold-bright/20"
        style={{ animationDelay: "-11s" }}
      />

      <div className="relative w-full max-w-sm stagger">
        <div className="flex flex-col items-center gap-4 mb-8">
          <span className="bob flex items-center justify-center w-20 h-20 rounded-[26px] bg-surface-1/80 border border-white/10 shadow-[0_0_0_1px_rgba(139,92,246,0.25),0_20px_60px_-12px_rgba(168,85,247,0.8)]">
            <HostelloMark size={42} />
          </span>
          <div className="flex flex-col items-center gap-1">
            <span className="display text-ink-primary text-2xl font-extrabold tracking-[0.18em]">HOSTELLO</span>
            <p className="text-sm font-semibold text-ink-secondary">Welcome back</p>
          </div>
        </div>

        <form
          action={login}
          className="card rounded-[28px] p-6 md:p-7 flex flex-col gap-4 backdrop-blur-xl"
        >
          <label className="relative block">
            <span className="sr-only">Email</span>
            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              className={field}
            />
          </label>

          <label className="relative block">
            <span className="sr-only">Password</span>
            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Password"
              className={field}
            />
          </label>

          {error && (
            <p className="text-xs font-semibold text-status-booked bg-status-booked/10 border border-status-booked/30 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <SubmitButton
            className="btn btn-primary mt-1 w-full h-12 rounded-2xl text-[15px]"
            blocking
            busy="Signing you in…"
            note="Checking your details and opening your portal."
          >
            Sign in
          </SubmitButton>

          <Link
            href="/auth/forgot-password"
            className="text-center text-xs font-semibold text-ink-muted hover:text-ink-secondary transition-colors"
          >
            Forgot your password?
          </Link>
        </form>

        <p className="text-center text-ink-muted text-xs mt-6">No account? Ask Hostello.</p>
      </div>
    </main>
  );
}
