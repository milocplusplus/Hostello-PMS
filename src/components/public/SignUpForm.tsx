import Link from "next/link";
import { Lock, Mail, Phone, User } from "lucide-react";
import { signUp } from "@/app/signup/actions";
import { SubmitButton } from "@/components/shared/Busy";

/**
 * The host sign-up form, shared by the landing page and /signup so the two cannot
 * drift. The action is the same either way: a refusal sends the person to /signup
 * with the reason, a success to its "check your inbox" screen.
 */
export function SignUpForm({ error }: { error?: string }) {
  const field = "field w-full h-12 pl-11 rounded-2xl";
  const icon = "absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none";

  return (
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
  );
}
