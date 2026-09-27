"use client";

import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

/**
 * A whole number that counts up from zero when it first appears. Starts at 0
 * on the server too, so hydration matches; reduced motion jumps straight there.
 */
export function CountUp({ value, duration = 1.3 }: { value: number; duration?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const controls = animate(0, value, {
      duration: reduce ? 0 : duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setShown,
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  return <>{Math.round(shown).toLocaleString("en-PK")}</>;
}
