import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Month / week stepper. Shared by the admin and owner calendars. */
export function MonthNav({
  label,
  prevHref,
  nextHref,
  todayHref,
}: {
  label: string;
  prevHref: string;
  nextHref: string;
  /** Present only when the window is not already on today. */
  todayHref?: string;
}) {
  const step =
    "w-10 h-10 rounded-xl flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:bg-white/5 active:scale-90 transition";
  return (
    <div className="flex items-center gap-2">
      <div className="card flex items-center gap-1 p-1 rounded-2xl">
        <Link href={prevHref} aria-label="Previous" className={step}>
          <ChevronLeft size={18} />
        </Link>
        <p className="num text-sm font-extrabold min-w-[150px] text-center">{label}</p>
        <Link href={nextHref} aria-label="Next" className={step}>
          <ChevronRight size={18} />
        </Link>
      </div>
      {todayHref && (
        <Link href={todayHref} className="btn btn-ghost h-12 rounded-2xl">
          Today
        </Link>
      )}
    </div>
  );
}

/**
 * Month / week / agenda. With `autoAgenda` a phone is really showing the
 * agenda and a desk the month, so the highlight says so at each width. Each
 * arm is spelled out: Tailwind can't see an interpolated variant prefix.
 */
export function ViewToggle({
  view,
  autoAgenda,
  hrefs,
}: {
  view: "month" | "week" | "agenda";
  autoAgenda: boolean;
  hrefs: Record<"month" | "week" | "agenda", string>;
}) {
  return (
    <div className="card flex items-center gap-1 p-1 rounded-2xl">
      {(["month", "week", "agenda"] as const).map((v) => {
        const cls =
          view === v
            ? autoAgenda && v === "month"
              ? "text-ink-secondary md:pill-active"
              : "pill-active"
            : autoAgenda && v === "agenda"
              ? "pill-active md:bg-none md:shadow-none md:text-ink-secondary"
              : "text-ink-secondary hover:text-ink-primary hover:bg-white/5";
        return (
          <Link
            key={v}
            href={hrefs[v]}
            className={`px-3.5 h-10 flex items-center rounded-xl text-xs font-bold capitalize transition-all duration-200 ${cls}`}
          >
            {v}
          </Link>
        );
      })}
    </div>
  );
}

/** Desk-only swatches: every bar already carries its channel's colour and
 *  initial, and on a phone the legend would push the calendar off screen. */
export function ChannelLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-ink-secondary flex-wrap">
      {items.map((l) => (
        <span key={l.label} className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-white/5">
          <span
            className="inline-block w-3.5 h-2.5 rounded-full"
            style={{ backgroundColor: l.color, boxShadow: `0 0 10px -2px ${l.color}` }}
          />
          {l.label}
        </span>
      ))}
    </div>
  );
}
