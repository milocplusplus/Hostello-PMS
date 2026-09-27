"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Info } from "lucide-react";

const noop = () => () => {};

/**
 * The (i) that replaces a paragraph of helper text: the explanation is one tap
 * away instead of always on screen. A bottom sheet on a phone, a centred card
 * on a desktop. Portalled to <body> because the cards it sits on animate with
 * transforms, which would otherwise trap a fixed overlay inside them.
 */
export function InfoSheet({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // False on the server and during hydration, true after: the portal target
  // only exists in the browser.
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`About ${title.toLowerCase()}`}
        aria-haspopup="dialog"
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90 ${className}`}
      >
        <Info size={17} strokeWidth={2.2} />
      </button>
      {inBrowser &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div
                className="fixed inset-0 z-[70] flex flex-col justify-end md:justify-center md:items-center md:p-6"
                role="dialog"
                aria-modal
                aria-label={title}
              >
                <motion.button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
                <motion.div
                  className="relative w-full md:max-w-sm bg-surface-1 border-t md:border border-white/10 rounded-t-[30px] md:rounded-[28px] px-5 pt-2.5 md:pt-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] md:pb-5 flex flex-col gap-4 shadow-[var(--shadow-pop)] text-ink-primary"
                  initial={{ opacity: 0, y: 80 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 80 }}
                  transition={{ type: "spring", damping: 30, stiffness: 340 }}
                >
                  <span className="md:hidden w-10 h-1.5 rounded-full bg-white/20 self-center" />
                  <h2 className="text-xl">{title}</h2>
                  <div className="text-sm text-ink-secondary leading-relaxed flex flex-col gap-3">
                    {children}
                  </div>
                  <button type="button" onClick={() => setOpen(false)} className="btn btn-primary h-12 text-[15px]">
                    Got it
                  </button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
