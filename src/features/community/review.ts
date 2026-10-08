import type { ReviewStatus } from "@/api/endpoints/community";
import { t, type MessageKey } from "@/i18n";

/**
 * A review of the job (C26, D1), checked here the way the server checks it — so a review
 * that would be refused isn't sent: every attempt counts against ten an hour per network,
 * shared with everyone behind the same mobile network.
 */

export const BODY_MIN = 10;
export const BODY_MAX = 1000;
export const NAME_MIN = 2;
export const NAME_MAX = 60;

/**
 * The text as the server keeps it (CommunityText.clean): trimmed, runs of spaces and tabs
 * folded to one, line ends made plain, no spaces around a line break, and at most one blank
 * line in a row. Its length is what the server holds to the minimum.
 */
export function cleanBody(text: string): string {
  return text
    .trim()
    .replace(/[ \t\x0B\f]+/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** A name on one line: trimmed, every run of space (line breaks too) folded to one — Java's \s, ASCII only. */
export function cleanName(text: string): string {
  return text.trim().replace(/[ \t\n\x0B\f\r]+/g, " ");
}

export interface ReviewProblems {
  rating: string | null;
  body: string | null;
  name: string | null;
}

/** What's missing before it can go, field by field — all null when it's ready. */
export function reviewProblems(rating: number, body: string, name: string): ReviewProblems {
  const b = cleanBody(body);
  const n = cleanName(name);
  return {
    rating: rating >= 1 && rating <= 5 ? null : t("review.needRating"),
    body: !b ? t("review.needBody") : b.length < BODY_MIN ? t("review.bodyShort") : body.length > BODY_MAX ? t("review.bodyLong") : null,
    name: !n ? t("review.needName") : n.length < NAME_MIN || n.length > NAME_MAX ? t("review.nameLength") : null,
  };
}

export const ready = (p: ReviewProblems) => !p.rating && !p.body && !p.name;

/** The words under the stars, as the website says them. */
export function starLabel(rating: number): string {
  return rating >= 1 && rating <= 5 ? t(`review.stars.${rating}` as MessageKey) : t("review.tapStar");
}

/** Where a written review stands, in a sentence. */
export function statusLine(status: ReviewStatus | string): string {
  if (status === "PUBLISHED") return t("review.published");
  if (status === "REJECTED") return t("review.rejected");
  return t("review.pending");
}
