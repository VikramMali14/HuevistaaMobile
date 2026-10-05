/**
 * The sentence a customer is shown when a run on their photo fails.
 *
 * The backend's `failureReason` goes straight onto the canvas, and for years it was
 * whatever the failing code happened to say: "REPLICATE_API_TOKEN not configured",
 * "Segmentation failed: Read timed out". The backend now writes sentences for people,
 * but this is the side that shows them, so it is also the side that refuses to show
 * anything that is plainly not one — an older backend, a message nobody reworded, an
 * exception that slipped through — and says something true and useful instead.
 *
 * Trying again re-runs the same room: it was paid for when it was created, so a retry
 * never costs another. Every fallback says so, because "will this use up another one of
 * my rooms?" is the question that stops somebody pressing the button.
 */

/** What a run that failed at an unknown point says. */
export const RUN_FAILED_MESSAGE =
  "Something went wrong while we were preparing your photo. It's saved — press Try again. Trying again won't use another room.";

/** What a run whose photo clean-up failed says. */
export const CLEAN_FAILED_MESSAGE =
  "We couldn't prepare this photo just now. It's saved — try again in a few minutes, or mark the walls yourself. Trying again won't use another room.";

/** What a run whose wall detection failed says. */
export const MASK_FAILED_MESSAGE =
  "We couldn't find the walls in this photo. Press Try again, or mark the walls yourself. Trying again won't use another room.";

/**
 * Text that was written for a log rather than a person: a setting's name
 * (REPLICATE_API_TOKEN), an exception or a stack frame, an HTTP status, a raw
 * "X failed: <cause>" wrapper, JSON.
 */
const TECHNICAL = [
  /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/,
  /exception|stack ?trace|\bnull\b|undefined|\bNaN\b/i,
  /\bat [\w$.]+\(/,
  /\b(java|org|com)\.[a-z]/,
  /\b(error|failed|failure)\s*:/i,
  /\bnot configured\b|\bnot found\b/i,
  /\b(timed? ?out|timeout|ECONN\w*|ETIMEDOUT|socket)\b/i,
  /\bHTTP\b|\bstatus \d{3}\b|\b[45]\d\d\b/,
  /[{}[\]<>]|https?:\/\//,
];

/** Whether a backend reason reads as a sentence meant for the customer. */
export function isPresentable(reason: string): boolean {
  const text = reason.trim();
  if (!text || text.length > 400) return false;
  return !TECHNICAL.some((re) => re.test(text));
}

/**
 * The backend's own words when they are fit to show, otherwise the right fallback for
 * the stage that failed.
 */
export function presentableFailure(reason?: string | null, stage?: string | null): string {
  if (reason && isPresentable(reason)) return reason.trim();
  if (stage === "CLEAN") return CLEAN_FAILED_MESSAGE;
  if (stage === "MASK") return MASK_FAILED_MESSAGE;
  return RUN_FAILED_MESSAGE;
}
