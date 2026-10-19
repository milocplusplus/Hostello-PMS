import Link from "next/link";
import { MailCheck } from "lucide-react";
import { HostelloMark } from "@/components/shared/HostelloMark";
import { SignUpForm } from "@/components/public/SignUpForm";
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
          <SignUpForm error={error} />
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
