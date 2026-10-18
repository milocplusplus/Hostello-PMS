import Link from "next/link";
import { Lock, Mail, MailCheck, Phone, User } from "lucide-react";
import { signUp } from "./actions";
import { HostelloMark } from "@/components/shared/HostelloMark";
import { SubmitButton } from "@/components/shared/Busy";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Start your free trial · Hostello" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  const supabase = await createClient();
  const { data: open } = await supabase.rpc("host_signup_open");
  const field = "field w-full h-12 pl-11 rounded-2xl";
  const icon = "absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none";

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6 py-10 overflow-hidden">
      <span aria-hidden className="orb w-[26rem] h-[26rem] -top-24 -left-32 bg-hostello-purple-glow/45" />
      <span
        aria-hidden
        className="orb w-[22rem] h-[22rem] top-1/3 -right-40 bg-hostello-magenta/35"
        style={{ animationDelay: "-6s" }}
      />

      <div className="relative w-full max-w-sm stagger">
        <div className="flex flex-col items-center gap-3 mb-6">
          <HostelloMark size={42} />
          <span className="display text-ink-primary text-2xl font-extrabold tracking-[0.18em]">HOSTELLO</span>
          <p className="text-sm font-semibold text-ink-secondary">Start your 14-day free trial</p>
        </div>

        {sent ? (
          <div className="card rounded-[28px] p-6 flex flex-col items-center gap-3 text-center">
            <MailCheck size={22} className="text-hostello-gold" />
            <p className="text-sm text-ink-primary">Check your inbox.</p>
            <p className="text-xs text-ink-secondary">
              We sent a link to confirm your email. Open it to finish creating your account.
            </p>
          </div>
        ) : !open ? (
          <div className="card rounded-[28px] p-6 flex flex-col gap-2 text-center">
            <p className="text-sm text-ink-primary">Sign-ups are not open yet.</p>
            <p className="text-xs text-ink-secondary">Please check back soon.</p>
          </div>
        ) : (
          <form action={signUp} className="card rounded-[28px] p-6 md:p-7 flex flex-col gap-4">
            <label className="relative block">
              <span className="sr-only">Your name</span>
              <User size={18} className={icon} />
              <input name="full_name" required autoComplete="name" placeholder="Your name" className={field} />
            </label>
            <label className="relative block">
              <span className="sr-only">Email</span>
              <Mail size={18} className={icon} />
              <input name="email" type="email" required autoComplete="email" placeholder="Email" className={field} />
            </label>
            <label className="relative block">
              <span className="sr-only">Phone (optional)</span>
              <Phone size={18} className={icon} />
              <input name="phone" type="tel" autoComplete="tel" placeholder="Phone (optional)" className={field} />
            </label>
            <label className="relative block">
              <span className="sr-only">Password</span>
              <Lock size={18} className={icon} />
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Password (8+ characters)"
                className={field}
              />
            </label>

            <label className="flex items-start gap-2.5 text-xs text-ink-secondary">
              <input type="checkbox" name="terms" required className="mt-0.5" />
              <span>
                I agree to the{" "}
                <Link href="/terms" className="text-hostello-gold hover:underline">
                  terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-hostello-gold hover:underline">
                  privacy policy
                </Link>
                .
              </span>
            </label>

            {error && (
              <p className="text-xs font-semibold text-status-booked bg-status-booked/10 border border-status-booked/30 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <SubmitButton
              className="btn btn-primary mt-1 w-full h-12 rounded-2xl text-[15px]"
              blocking
              busy="Creating your account…"
              note="Sending you a confirmation email."
            >
              Start free trial
            </SubmitButton>
            <p className="text-center text-[11px] text-ink-muted">No card needed.</p>
          </form>
        )}

        <p className="text-center text-ink-muted text-xs mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-hostello-gold font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
