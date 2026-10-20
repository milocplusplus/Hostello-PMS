"use client";

import { useId, useState } from "react";
import { Check, Eye, EyeOff, Lock, X } from "lucide-react";
import { passwordStrength } from "@/lib/password-strength";

const BAR = ["bg-white/10", "bg-status-booked", "bg-status-pending", "bg-status-available", "bg-status-available"];
const TEXT = ["text-ink-muted", "text-status-booked", "text-status-pending", "text-status-available", "text-status-available"];

/**
 * The sign-up password box with a strength bar and a plain list of what makes a
 * password good. It guides; the server decides. A strong password is one that is
 * long and varied, so the list says exactly that and a tip shows an easy way to get there.
 */
export function PasswordField({ name = "password" }: { name?: string }) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const hintId = useId();
  const s = passwordStrength(value);

  return (
    <div className="flex flex-col gap-2.5">
      <label className="relative block">
        <span className="sr-only">Password</span>
        <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
        <input
          name={name}
          type={show ? "text" : "password"}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby={hintId}
          className="field w-full h-12 pl-11 pr-12 rounded-2xl"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-ink-muted hover:text-ink-primary transition-colors"
        >
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </label>

      <div id={hintId} className="flex flex-col gap-2" aria-live="polite">
        <div className="flex items-center gap-3">
          <div className="flex-1 grid grid-cols-4 gap-1.5" role="presentation">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-colors ${s.score >= i ? BAR[s.score] : "bg-white/10"}`}
              />
            ))}
          </div>
          <span className={`text-xs font-semibold min-w-[5.5rem] text-right ${TEXT[s.score]}`}>
            {s.label || "Choose a password"}
          </span>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          {s.checks.map((c) => (
            <li key={c.id} className={`flex items-center gap-1.5 text-[11px] ${c.ok ? "text-status-available" : "text-ink-muted"}`}>
              {c.ok ? <Check size={12} aria-hidden /> : <X size={12} aria-hidden />}
              {c.label}
            </li>
          ))}
        </ul>

        <p className="text-[11px] text-ink-muted leading-relaxed">
          Tip: three random words and a number, like <span className="text-ink-secondary">maple-river-lamp-42</span>, is
          easy to remember and hard to guess. Don&apos;t reuse a password from another site.
        </p>
      </div>
    </div>
  );
}
