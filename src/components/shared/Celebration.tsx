"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { CountUp } from "@/components/shared/CountUp";

const noop = () => () => {};

const COLORS = ["#f5c968", "#a855f7", "#c026d3", "#34d399", "#60a5fa", "#ffffff"];

/** Fixed pieces rather than random ones, so server and client agree. */
const CONFETTI = Array.from({ length: 46 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  w: 6 + (i % 3) * 3,
  h: i % 4 === 0 ? 6 + (i % 3) * 3 : 12 + (i % 3) * 2,
  color: COLORS[i % COLORS.length],
  round: i % 4 === 0,
  drift: i % 2 ? -70 : 60,
  spin: i % 2 ? 560 : -500,
  duration: 2.4 + (i % 5) * 0.35,
  delay: (i % 11) * 0.07,
}));

/**
 * The moment money is confirmed as arrived: confetti, a drawn check, the
 * amount counting up and the Sent → Confirmed track filling. Shown once, on
 * the receipt a confirm lands on; Done drops the flag from the URL so a
 * refresh or a shared link shows the plain receipt.
 */
export function Celebration({ amount }: { amount: number }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  const reduce = useReducedMotion();

  function done() {
    setOpen(false);
    router.replace(pathname, { scroll: false });
  }

  if (!inBrowser) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal
          aria-label="Payment received"
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-5 px-6 overflow-hidden"
          style={{
            background:
              "radial-gradient(circle at 50% 34%, rgba(88,28,135,0.97), rgba(7,6,12,0.99) 62%)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {!reduce && CONFETTI.map((c, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute -top-6"
              style={{
                left: `${c.left}%`,
                width: c.w,
                height: c.h,
                background: c.color,
                borderRadius: c.round ? "50%" : 2,
              }}
              initial={{ y: 0, x: 0, rotate: 0, opacity: 0 }}
              animate={{ y: "105vh", x: c.drift, rotate: c.spin, opacity: [0, 1, 1, 0.9] }}
              transition={{ duration: c.duration, delay: c.delay, ease: [0.25, 0.5, 0.55, 1] }}
            />
          ))}

          <motion.span
            className="w-[8.5rem] h-[8.5rem] rounded-full gradient-gold flex items-center justify-center shadow-[0_0_0_14px_rgba(245,201,104,0.12),0_0_90px_rgba(245,201,104,0.65)]"
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
          >
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.55 }}
              className="text-surface-0"
            >
              <Check size={68} strokeWidth={3} />
            </motion.span>
          </motion.span>

          <h2 className="text-3xl mt-2">Received</h2>
          <p className="num text-4xl font-extrabold text-hostello-gold-bright">
            Rs <CountUp value={amount} duration={1.2} />
          </p>

          <div className="w-full max-w-[18.5rem] flex flex-col gap-2 mt-1">
            <div className="relative h-2 rounded-full bg-white/12 overflow-hidden">
              <motion.span
                className="absolute inset-0 rounded-full origin-left"
                style={{ background: "linear-gradient(90deg, var(--color-hostello-purple-glow), var(--color-hostello-gold-bright))" }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 1.1, delay: 0.9, ease: [0.6, 0, 0.2, 1] }}
              />
            </div>
            <div className="flex justify-between text-xs font-extrabold">
              <span className="text-hostello-purple-light">Sent</span>
              <span className="text-hostello-gold-bright">Confirmed</span>
            </div>
          </div>

          <button
            type="button"
            onClick={done}
            className="btn mt-3 w-full max-w-[18.5rem] h-14 rounded-2xl bg-white text-surface-0 text-base font-extrabold"
          >
            Done
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
