import type { ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";

/**
 * One numbered question on a step form (booking, block dates). Its badge turns
 * gold once it's answered.
 */
export function FormStep({
  n,
  icon: Icon,
  title,
  done,
  aside,
  children,
}: {
  n: number;
  icon: LucideIcon;
  title: string;
  done: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span
            className={`shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              done
                ? "gradient-gold text-surface-0 shadow-[0_8px_22px_-8px_rgba(245,201,104,0.9)]"
                : "gradient-brand-subtle border border-hostello-purple-glow/25 text-hostello-gold-bright"
            }`}
          >
            {done ? (
              <Check key="done" size={17} strokeWidth={3} className="animate-receipt-pop" aria-label="Done" />
            ) : (
              <Icon size={16} aria-hidden />
            )}
          </span>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">Step {n}</span>
            <h2 className="text-sm">{title}</h2>
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The drifting purple and gold light behind a step form, as on the Coming Soon screens. */
export function FormGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-clip" aria-hidden>
      <span className="orb w-72 h-72 top-[4%] left-[6%] bg-hostello-purple-glow/20" />
      <span className="orb w-64 h-64 top-1/3 right-[8%] bg-hostello-gold/12" />
      <span className="orb w-56 h-56 bottom-[8%] left-1/3 bg-hostello-magenta/12" />
    </div>
  );
}
