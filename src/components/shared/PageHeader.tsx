import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { InfoSheet } from "@/components/shared/InfoSheet";

/**
 * Every page's top: a heavy title, an optional back link and actions, and at
 * most one short line under it. Anything longer — what the page is for, how it
 * works — goes in `info`, behind an (i), instead of sitting on screen.
 */
export function PageHeader({
  title,
  sub,
  info,
  back,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  info?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="relative isolate flex flex-col gap-2">
      {/* A pool of light behind every page title. */}
      <span aria-hidden className="orb -z-10 w-64 h-32 -top-8 left-0 bg-hostello-purple-glow/30" />
      {back && (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-hostello-purple-light transition-colors w-fit"
        >
          <ArrowLeft size={14} />
          {back.label}
        </Link>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <h1 className="text-[28px] md:text-3xl truncate text-gradient-brand pb-0.5">{title}</h1>
          {info && (
            <InfoSheet title={title} className="bg-white/8 text-ink-secondary">
              {info}
            </InfoSheet>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {sub && <p className="text-sm font-semibold text-ink-secondary -mt-1">{sub}</p>}
      <span aria-hidden className="bar-grow block h-1 w-12 rounded-full gradient-brand mt-1" />
    </div>
  );
}

/**
 * An honest empty state that still looks alive: an icon in a glowing badge and
 * one line saying why there is nothing here, with an optional way forward.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  inset = false,
}: {
  icon: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  /** Inside a card already: a tile rather than a second card. */
  inset?: boolean;
}) {
  return (
    <div
      className={`${inset ? "tile px-5 py-8" : "card p-8"} relative overflow-clip isolate flex flex-col items-center text-center gap-3`}
    >
      <span aria-hidden className="orb -z-10 w-48 h-48 -top-16 left-1/2 -translate-x-1/2 bg-hostello-purple-glow/25" />
      <span className="bob w-12 h-12 rounded-2xl gradient-brand-subtle border border-hostello-purple-glow/30 flex items-center justify-center text-hostello-gold-bright shadow-[0_12px_30px_-12px_rgba(139,92,246,0.8)]">
        <Icon size={20} aria-hidden />
      </span>
      <p className="text-sm font-semibold text-ink-primary">{title}</p>
      {body && <p className="text-xs text-ink-secondary max-w-sm">{body}</p>}
      {action}
    </div>
  );
}
