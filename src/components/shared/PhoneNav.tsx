"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LayoutGrid, type LucideIcon } from "lucide-react";

export type TabItem = { href: string; label: string; icon: LucideIcon; exact: boolean };
export type MoreItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  tint: string;
  badge?: number;
  /** Reachable, but not yet fed by real data — say so rather than imply it works. */
  soon?: boolean;
};

export const isActive = (pathname: string, href: string, exact: boolean) =>
  exact ? pathname === href : pathname.startsWith(href);

/** The selected item's fill in every nav, phone and desktop. */
export const PILL = {
  background: "linear-gradient(135deg, var(--color-hostello-purple-glow), var(--color-hostello-magenta))",
  boxShadow: "0 6px 20px -4px rgba(168, 85, 247, 0.9)",
};

/**
 * The phone's bottom bar: four tabs and More. Both shells use it, so the two
 * portals' phones behave as one app. `data-tabbar` is what globals.css keys the
 * page's bottom padding (and the toasts' offset) on.
 */
export function TabBar({
  tabs,
  more,
  pathname,
  dot,
  onMore,
}: {
  tabs: TabItem[];
  more: MoreItem[];
  pathname: string;
  /** A gold dot on More, for something unread behind it. */
  dot: boolean;
  onMore: () => void;
}) {
  const moreActive = more.some((m) => pathname.startsWith(m.href));
  const item = "relative flex flex-col items-center gap-1 text-[11px] font-bold transition-colors";
  const pill = (active: boolean) =>
    active ? (
      <motion.span
        layoutId="tab-pill"
        className="absolute inset-0 rounded-xl"
        style={PILL}
        transition={{ type: "spring", stiffness: 520, damping: 34 }}
      />
    ) : null;

  return (
    <nav
      data-tabbar
      aria-label="Main"
      className="md:hidden fixed z-30 left-3 right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] h-[4.5rem] rounded-[26px] bg-surface-1/90 backdrop-blur-xl border border-white/10 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)] grid grid-cols-5 items-center px-1"
    >
      {tabs.map((t) => {
        const active = isActive(pathname, t.href, t.exact);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`${item} ${active ? "text-white" : "text-ink-muted"}`}
          >
            <span className="relative w-12 h-8 flex items-center justify-center">
              {pill(active)}
              <t.icon size={20} strokeWidth={2.2} className="relative" />
            </span>
            {t.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        aria-haspopup="dialog"
        className={`${item} ${moreActive ? "text-white" : "text-ink-muted"}`}
      >
        <span className="relative w-12 h-8 flex items-center justify-center">
          {pill(moreActive)}
          <LayoutGrid size={20} strokeWidth={2.2} className="relative" />
          {dot && (
            <span className="absolute top-0.5 right-2.5 w-2 h-2 rounded-full bg-hostello-gold-bright shadow-[0_0_0_2px_var(--color-surface-1),0_0_8px_var(--color-hostello-gold-bright)]" />
          )}
        </span>
        More
      </button>
    </nav>
  );
}

/** Everything that isn't a tab, as an app grid in a sheet that swipes down. */
export function MoreSheet({
  open,
  onClose,
  items,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  items: MoreItem[];
  footer: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal aria-label="More">
          <motion.button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative bg-surface-1 border-t border-white/10 rounded-t-[30px] pt-2.5 pb-[env(safe-area-inset-bottom)] flex flex-col gap-4 shadow-[var(--shadow-pop)] max-h-[85dvh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 340 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) onClose();
            }}
          >
            <span className="w-10 h-1.5 rounded-full bg-white/20 self-center shrink-0" />
            <div className="grid grid-cols-4 gap-y-5 gap-x-2 px-5 pt-2">
              {items.map((m, i) => (
                <motion.div
                  key={m.href}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.03, type: "spring", stiffness: 420, damping: 28 }}
                >
                  <Link
                    href={m.href}
                    onClick={onClose}
                    className="flex flex-col items-center gap-2 text-xs font-bold text-ink-primary text-center active:scale-95 transition-transform"
                  >
                    <span
                      className="relative w-14 h-14 rounded-[20px] flex items-center justify-center text-white shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)]"
                      style={{ background: m.tint }}
                    >
                      <m.icon size={24} strokeWidth={2} />
                      {m.badge ? (
                        <span className="num absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[10px] font-extrabold text-surface-0 gradient-gold flex items-center justify-center">
                          {m.badge > 9 ? "9+" : m.badge}
                        </span>
                      ) : null}
                      {m.soon && (
                        <span className="absolute -top-1 -right-2 px-1.5 rounded-full text-[9px] font-extrabold uppercase bg-surface-3 text-ink-secondary border border-white/10">
                          Soon
                        </span>
                      )}
                    </span>
                    {m.label}
                  </Link>
                </motion.div>
              ))}
            </div>
            {footer}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
