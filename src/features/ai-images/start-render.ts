import { onlineManager } from "@tanstack/react-query";

import { projectsApi } from "@/api/endpoints/projects";
import { isApiError, messageFor } from "@/api/errors";
import { keys, renderChanges } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";
import type { ProjectRender, RenderChoices, RenderRequest } from "@/api/types";
import { t } from "@/i18n";

import { trackRender } from "./in-flight";

export type StartOutcome =
  /** Asked for, and its credits spent. */
  | { kind: "started"; render: ProjectRender }
  /** 402: not enough credits. Nothing was spent. */
  | { kind: "short"; message: string }
  /** The option has left the room's board (404). */
  | { kind: "optionGone"; message: string }
  /** Any other refusal (the room has gone, too many asks, a bad choice). Nothing was spent. */
  | { kind: "refused"; message: string; field?: "note" }
  /** The phone is offline: nothing was sent, so nothing was spent. */
  | { kind: "offline" }
  /** No answer, and the room's images didn't show whether it started. */
  | { kind: "unknown" };

export interface StartInput {
  projectId: string;
  comboId: string;
  choices: RenderChoices;
  note?: string;
}

/** The look at the room's images around the ask is a help, never worth a long wait. */
const LOOK_TIMEOUT_MS = 8_000;
/** After an unanswered ask, the room's images are looked at again after these waits. */
const RECHECK_AFTER_MS = [0, 2_000, 5_000];
/** Allowance between the phone's clock and the server's when an image ended "after the ask". */
const CLOCK_SLACK_MS = 2 * 60_000;

const CHOICES: readonly (keyof RenderChoices)[] = ["quality", "sourceImage", "timeOfDay", "borderMode", "lighting", "furnishing", "style"];

/** When the server made it, as a moment (it writes India time with no zone). */
export function serverTime(iso: string | null | undefined): number {
  if (!iso) return NaN;
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}+05:30`);
}

/**
 * The room's images as they stand, so one that appears after an unanswered ask can be told
 * apart from those before it. Asked directly, briefly — never through the cache, whose
 * reads wait while the phone is offline — and else the list as the screen last had it.
 */
async function imagesBefore(projectId: string): Promise<Set<string> | null> {
  try {
    const list = await projectsApi.renders(projectId, LOOK_TIMEOUT_MS);
    queryClient.setQueryData(keys.roomRenders(projectId), list);
    return new Set(list.map((r) => r.id));
  } catch {
    const kept = queryClient.getQueryData<ProjectRender[]>(keys.roomRenders(projectId));
    return kept ? new Set(kept.map((r) => r.id)) : null;
  }
}

/** An image asked for exactly as this ask was: its option, every choice and the note. */
function sameAsk(r: ProjectRender, sent: RenderRequest): boolean {
  return r.comboId === sent.comboId && CHOICES.every((k) => r[k] === sent[k]) && (r.note ?? "").trim() === (sent.note ?? "");
}

/**
 * C23 · Make my image. Spending happens on the server, inside this one request: there is
 * no idempotency key, so a second ask is a second charge and the request is never sent
 * twice. Offline, nothing is sent. A reply is obeyed (402, 404, 429 — nothing spent).
 * Silence (no connection, a timeout, a 5xx — the server's AI queue can hold the answer for
 * minutes) is not taken for a "no": the room's images are looked at again, a few seconds
 * apart, and an image asked for exactly so — new since the ask, or still being made — is
 * this request's.
 */
export interface StartClock {
  now?: () => number;
  /** How a wait between looks is waited (tests skip it). */
  sleep?: (ms: number) => Promise<void>;
}

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function startRender(input: StartInput, clock: StartClock = {}): Promise<StartOutcome> {
  const now = clock.now ?? Date.now;
  const sleep = clock.sleep ?? sleepFor;
  if (!onlineManager.isOnline()) return { kind: "offline" };
  const { projectId, comboId, choices } = input;
  const note = input.note?.trim();
  const sent: RenderRequest = { comboId, ...choices, ...(note ? { note } : {}) };
  const before = await imagesBefore(projectId);
  const askedAt = now();

  let render: ProjectRender | null = null;
  try {
    render = await projectsApi.requestRender(projectId, sent);
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
    render = await findStarted(projectId, sent, before, askedAt, sleep);
    if (!render) return { kind: "unknown" };
  }

  queryClient.setQueryData(keys.render(projectId, render.id), render);
  trackRender(projectId, render.id, askedAt);
  // The credits are spent already; the rest catches up when it ends.
  for (const filters of renderChanges(projectId)) void queryClient.invalidateQueries(filters).catch(() => {});
  return { kind: "started", render };
}

/**
 * After an unanswered ask: an image of exactly this ask that wasn't there before it — or,
 * without the list from before, one still being made or ended since the ask (never an
 * earlier finished one of the same option).
 */
async function findStarted(
  projectId: string,
  sent: RenderRequest,
  before: Set<string> | null,
  askedAt: number,
  sleep: (ms: number) => Promise<void>,
): Promise<ProjectRender | null> {
  for (const wait of RECHECK_AFTER_MS) {
    if (wait) await sleep(wait);
    try {
      const list = await projectsApi.renders(projectId, LOOK_TIMEOUT_MS);
      queryClient.setQueryData(keys.roomRenders(projectId), list);
      const mine = list.find((r) => {
        if (!sameAsk(r, sent)) return false;
        if (before) return !before.has(r.id);
        if (r.status === "QUEUED" || r.status === "RUNNING") return true;
        const ended = serverTime(r.completedAt);
        return Number.isFinite(ended) && ended >= askedAt - CLOCK_SLACK_MS;
      });
      if (mine) return mine;
    } catch {
      // Look again after the next wait.
    }
  }
  return null;
}
