/** The phone passes the live-colour check when a colour change shows in under this (docs/04 C11). */
export const TARGET_MS = 100;

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

export interface CheckResult {
  firstFrameMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
}

/** The numbers to read out, in the words the screen uses. */
export function summarise(times: number[], firstFrameMs: number): CheckResult {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    firstFrameMs,
    medianMs: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}
