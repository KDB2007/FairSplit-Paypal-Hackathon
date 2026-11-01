"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A number that tweens to its new value whenever `value` changes (and counts up
 * from `from` on mount). Screen readers get the final value only; reduced
 * motion jumps straight to it.
 */
export function NumberTicker({
  value,
  format = (v) => Math.round(v).toString(),
  from,
  duration = 0.6,
  delay = 0,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  from?: number;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(reduce ? value : (from ?? value));
  const text = useTransform(motionValue, (v) => format(v));

  useEffect(() => {
    if (reduce) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, { duration, delay, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, reduce, duration, delay, motionValue]);

  return (
    <span className={cn("tabular-nums", className)}>
      <motion.span aria-hidden>{text}</motion.span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
