import { useEffect, useRef, useState } from "react";

import { Text, type TextProps } from "./Text";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * A number that counts up to its value when it changes — a balance growing as points land
 * (the painter website's CountUp: 900 ms, ease-out, Indian grouping). From the last value
 * shown, so a refresh that changes nothing doesn't replay it; straight to the value under
 * Reduce motion. A screen reader is given the value itself, never the frames.
 */
export function CountUp({ value, from, format = (n) => Math.round(n).toLocaleString("en-IN"), ...text }: { value: number; from?: number; format?: (n: number) => string } & TextProps) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(from ?? value);
  const last = useRef(from ?? value);

  useEffect(() => {
    const start = last.current;
    last.current = value;
    if (reduced || start === value) {
      setShown(value);
      return;
    }
    const began = Date.now();
    const timer = setInterval(() => {
      const p = Math.min(1, (Date.now() - began) / 900);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + (value - start) * eased);
      if (p >= 1) clearInterval(timer);
    }, 30);
    return () => {
      clearInterval(timer);
      setShown(value);
    };
  }, [value, reduced]);

  return (
    <Text {...text} accessibilityLabel={format(value)}>
      {format(shown)}
    </Text>
  );
}
