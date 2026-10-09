import type { PublicQuestion, QuestionPage } from "@/api/endpoints/community";
import { t } from "@/i18n";

import { cleanBody, cleanName } from "./review";

/**
 * Asking a question (S8), checked the way the server checks it — every attempt counts
 * against ten an hour per network, so one that would be refused isn't sent.
 */
export const QUESTION_MIN = 10;
export const QUESTION_MAX = 500;
export const NAME_MIN = 2;
export const NAME_MAX = 60;

export function questionProblems(body: string, name: string): { body: string | null; name: string | null } {
  const b = cleanBody(body);
  const n = cleanName(name);
  return {
    body: !b ? t("questions.needQuestion") : b.length < QUESTION_MIN ? t("questions.questionShort") : body.length > QUESTION_MAX ? t("questions.questionLong") : null,
    name: !n ? t("questions.needName") : n.length < NAME_MIN || n.length > NAME_MAX ? t("questions.nameLength") : null,
  };
}

/**
 * The pages read so far, as one list. The order is by newest answer, which moves when one
 * is answered (or answered again), so a later page can repeat a row: each is kept once.
 */
export function flatten(pages: readonly QuestionPage[] | undefined): PublicQuestion[] {
  const seen = new Set<string>();
  const out: PublicQuestion[] = [];
  for (const page of pages ?? []) {
    for (const q of page.items) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      out.push(q);
    }
  }
  return out;
}
