import { useQuery, type Query, type UseQueryOptions } from "@tanstack/react-query";
import { useEffect } from "react";

import { projectsApi } from "@/api/endpoints/projects";
import { isApiError } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { AiCreditSummary, ProjectRender } from "@/api/types";

import { startedAtFor, trackRender } from "./in-flight";
import { serverTime } from "./start-render";

/** The copy turns to "taking longer than usual" here (the website's SLOW_AFTER_MS). */
export const SLOW_AFTER_MS = 90_000;
/**
 * And to "much longer than usual" here: past the server's own ceiling for making one (an
 * 8-minute budget), as the website waits. Polling carries on — the server sweeps a stuck
 * image to FAILED, credits handed back, within about 22 minutes.
 */
export const LONG_AFTER_MS = 570_000;

/** Every 2 s for the first minute, then every 5 s; every 15 s once it is very late. */
export function renderPollDelay(elapsedMs: number): number {
  if (elapsedMs < 60_000) return 2_000;
  if (elapsedMs < LONG_AFTER_MS) return 5_000;
  return 15_000;
}

export function isFinal(render: Pick<ProjectRender, "status"> | null | undefined): boolean {
  return render?.status === "READY" || render?.status === "FAILED";
}

export function isBeingMade(render: Pick<ProjectRender, "status"> | null | undefined): boolean {
  return render?.status === "QUEUED" || render?.status === "RUNNING";
}

/** Not this account's (any more): the room has gone, or the image isn't on it. */
export function isGone(err: unknown): boolean {
  return isApiError(err) && err.kind === "http" && (err.status === 404 || err.status === 403);
}

/** When it started, steady across renders, by the phone's clock (in-flight.ts). */
export function startedAtOf(render: Pick<ProjectRender, "id" | "createdAt">, now: number = Date.now()): number {
  return startedAtFor(render.id, serverTime(render.createdAt), now);
}

type RenderQuery = Query<ProjectRender, Error, ProjectRender, readonly unknown[]>;

/**
 * One image as the app reads it. A finished one is never read again on its own — its
 * picture's address is signed afresh on every read. `poll`: read it again while it is being
 * made (RenderWatcher does; screens only read what it brings).
 */
export function renderQuery(projectId: string, renderId: string, poll: boolean): UseQueryOptions<ProjectRender, Error, ProjectRender, readonly unknown[]> {
  return {
    queryKey: keys.render(projectId, renderId),
    queryFn: () => projectsApi.render(projectId, renderId),
    enabled: Boolean(projectId && renderId),
    retry: (failures, err) => !isGone(err) && failures < 2,
    staleTime: (q: RenderQuery) => (isFinal(q.state.data) ? Infinity : 0),
    refetchInterval: poll
      ? (q: RenderQuery) => {
          const render = q.state.data;
          // Nothing to go on, or gone, or ended: no more reads by themselves.
          if (!render || isGone(q.state.error) || isFinal(render)) return false;
          return renderPollDelay(Date.now() - startedAtOf(render));
        }
      : false,
  };
}

/**
 * C24 · one AI image. While it is being made it is handed to RenderWatcher, which polls it
 * (pausing in the background, at once on return) until it ends — wherever the customer goes.
 */
export function useRender(projectId: string, renderId: string) {
  const query = useQuery(renderQuery(projectId, renderId, false));
  const making = isBeingMade(query.data);
  useEffect(() => {
    if (making) trackRender(projectId, renderId);
  }, [making, projectId, renderId]);
  return { ...query, gone: isGone(query.error) };
}

/**
 * Whether the wallet shows this failed image's credits coming back: a "returned" row made
 * since it was asked for. The row names no image, so it is only a sign — used to decide
 * whether a fallback sentence may say so.
 */
export function refundSeen(wallet: Pick<AiCreditSummary, "recentActivity"> | null | undefined, render: Pick<ProjectRender, "createdAt">): boolean {
  const asked = serverTime(render.createdAt);
  return Boolean(
    wallet?.recentActivity?.some((row) => {
      if (row.type !== "RENDER_REFUNDED") return false;
      const at = serverTime(row.createdAt);
      return Number.isFinite(asked) && Number.isFinite(at) && at >= asked;
    }),
  );
}
