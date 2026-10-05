import { useCallback, useEffect, useState } from "react";

/**
 * Seconds left before something may happen again — the server's `resendAfterSeconds`,
 * never a client guess (a guess enables the button early, which earns a 429, or late).
 */
export function useCountdown(initialSeconds: number) {
  const [left, setLeft] = useState(Math.max(0, Math.floor(initialSeconds)));

  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  const restart = useCallback((seconds: number) => setLeft(Math.max(0, Math.floor(seconds))), []);
  return { left, done: left <= 0, restart };
}

/** 42 → "0:42", 75 → "1:15". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A whole number of seconds from a route param; `fallback` when it is missing or not a number (0 is a real answer). */
export function secondsParam(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}
