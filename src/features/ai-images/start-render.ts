import { projectsApi } from "@/api/endpoints/projects";
import { isApiError, messageFor } from "@/api/errors";
import { keys, renderChanges } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";
import type { ProjectRender, RenderChoices } from "@/api/types";
import { t } from "@/i18n";

export type StartOutcome =
  /** Asked for, and its credits spent. */
  | { kind: "started"; render: ProjectRender }
  /** 402: not enough credits. Nothing was spent. */
  | { kind: "short"; message: string }
  /** The option has left the room's board (404). */
  | { kind: "optionGone"; message: string }
  /** Any other refusal (the room has gone, too many asks, a bad choice). Nothing was spent. */
  | { kind: "refused"; message: string; field?: "note" }
  /** No answer, and the room's images couldn't be read to find out whether it started. */
  | { kind: "unknown" };

export interface StartInput {
  projectId: string;
  comboId: string;
  choices: RenderChoices;
  note?: string;
}

/** The room's images as they stand, so one that appears after an unanswered ask is known for ours. */
async function imagesBefore(projectId: string): Promise<Set<string> | null> {
  try {
    const list = await queryClient.fetchQuery({
      queryKey: keys.roomRenders(projectId),
      queryFn: () => projectsApi.renders(projectId),
      staleTime: 0,
      // One try: on a bad connection the ask itself is what matters, not waiting on this.
      retry: false,
    });
    return new Set(list.map((r) => r.id));
  } catch {
    return null;
  }
}

/** When the server made it, as a moment (it writes India time with no zone). */
export function serverTime(iso: string | null | undefined): number {
  if (!iso) return NaN;
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}+05:30`);
}

/**
 * C23 · Make my image. Spending happens on the server, inside this one request: there is
 * no idempotency key, so a second ask is a second charge and the request is never sent
 * twice. A reply is obeyed (402, 404, 429 — nothing spent). Silence (no connection, a
 * timeout, a 5xx — the server's AI queue can hold the answer for minutes) is not taken
 * for a "no": the room's images are read again, and a new one of this option that wasn't
 * there before is this request's.
 */
export async function startRender(input: StartInput, now: () => number = Date.now): Promise<StartOutcome> {
  const { projectId, comboId, choices } = input;
  const note = input.note?.trim();
  const before = await imagesBefore(projectId);
  const askedAt = now();

  let render: ProjectRender | null = null;
  try {
    render = await projectsApi.requestRender(projectId, { comboId, ...choices, ...(note ? { note } : {}) });
  } catch (err) {
    if (isApiError(err) && err.kind === "http" && err.status >= 400 && err.status < 500) {
      if (err.status === 402) return { kind: "short", message: messageFor(err) };
      if (err.status === 404) {
        return /combination/i.test(err.message)
          ? { kind: "optionGone", message: t("aiImage.optionGone") }
          : { kind: "refused", message: t("aiImage.roomGone") };
      }
      if (err.status === 400 && err.fieldErrors?.note) return { kind: "refused", message: err.fieldErrors.note, field: "note" };
      return { kind: "refused", message: messageFor(err) };
    }
    render = await findStarted(projectId, comboId, before, askedAt);
    if (!render) return { kind: "unknown" };
  }

  queryClient.setQueryData(keys.render(projectId, render.id), render);
  // The credits are spent already; the rest catches up when it ends.
  for (const queryKey of renderChanges(projectId)) void queryClient.invalidateQueries({ queryKey }).catch(() => {});
  return { kind: "started", render };
}

/** After an unanswered ask: this option's newest image, if it is new since the ask. */
async function findStarted(projectId: string, comboId: string, before: Set<string> | null, askedAt: number): Promise<ProjectRender | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const list = await projectsApi.renders(projectId);
      const mine = list.find((r) => {
        if (r.comboId !== comboId) return false;
        // Known before the ask → not ours. Without that list, only one made just now can be.
        if (before) return !before.has(r.id);
        const made = serverTime(r.createdAt);
        return Number.isFinite(made) && made >= askedAt - 2 * 60_000;
      });
      return mine ?? null;
    } catch {
      // Try once more; then it is not known.
    }
  }
  return null;
}
