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

/**
 * A step form: the steps on the left, a live summary on the right that sticks
 * while the steps scroll. Two columns only when there is room — a container
 * query, so it also works inside a narrow modal.
 */
export function StepForm({
  action,
  children,
  aside,
}: {
  action: (formData: FormData) => void;
  children: ReactNode;
  aside: ReactNode;
}) {
  return (
    <div className="@container relative isolate">
      <FormGlow />
      <form action={action} className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_320px] @3xl:items-start">
        <div className="stagger flex flex-col gap-4 min-w-0">{children}</div>
        <aside className="animate-in flex flex-col gap-3 @3xl:sticky @3xl:top-20">{aside}</aside>
      </form>
    </div>
  );
}

export type SummaryRow = {
  label: string;
  value: ReactNode;
  /** False while the question behind it is unanswered — shown dimmed. */
  set?: boolean;
  /** The headline figure (a price, a total). */
  big?: boolean;
};

/**
 * The loud card beside a step form. Only what has been entered — an
 * unanswered row says so rather than guessing.
 */
export function SummaryCard({
  icon: Icon,
  label,
  done,
  title,
  sub,
  rows = [],
  children,
}: {
  icon: LucideIcon;
  label: string;
  done: boolean[];
  title: ReactNode;
  sub?: ReactNode;
  rows?: SummaryRow[];
  children?: ReactNode;
}) {
  return (
    <div className="card-hero p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold opacity-90">
          <Icon size={13} aria-hidden />
          {label}
        </span>
        <span className="text-[10px] rounded-full bg-white/15 px-2 py-0.5">
          {done.filter(Boolean).length} of {done.length} set
        </span>
      </div>

      <div className="flex gap-1" aria-hidden>
        {done.map((on, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${on ? "bg-white" : "bg-white/20"}`}
          />
        ))}
      </div>

      <div className="min-w-0">
        <p className="text-xl font-bold leading-tight truncate">{title}</p>
        {sub && <p className="text-xs opacity-75 truncate">{sub}</p>}
      </div>

      {children}

      {rows.length > 0 && (
        <dl className="flex flex-col gap-2 text-xs">
          {rows.map((r) => (
            <div
              key={r.label}
              className={`flex items-baseline justify-between gap-3 ${r.big ? "pt-2 border-t border-white/15" : ""}`}
            >
              <dt className="opacity-70 shrink-0">{r.label}</dt>
              <dd
                className={`min-w-0 truncate text-right ${
                  r.set === false ? "opacity-60" : r.big ? "num text-xl font-extrabold" : "font-semibold"
                }`}
              >
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * A pick-one row of pills, each with an optional colour dot. Posts the choice
 * under `name` when given.
 */
export function ChoiceChips<T extends string>({
  name,
  value,
  onChange,
  options,
  label,
}: {
  name?: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string; color?: string }[];
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {name && <input type="hidden" name={name} value={value} />}
      {options.map((o) => {
        const on = value === o.value;
        const color = o.color ?? "var(--color-hostello-gold)";
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-left transition-all ${
              on
                ? "text-ink-primary font-semibold"
                : "border-border-hairline text-ink-secondary hover:border-border-strong hover:text-ink-primary"
            }`}
            style={
              on
                ? {
                    borderColor: color,
                    backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
                    boxShadow: `0 6px 18px -8px ${color}`,
                  }
                : undefined
            }
          >
            <span
              className="w-2 h-2 shrink-0 rounded-full"
              style={{ backgroundColor: color, boxShadow: on ? `0 0 8px ${color}` : undefined, opacity: on || o.color ? 1 : 0.4 }}
            />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
