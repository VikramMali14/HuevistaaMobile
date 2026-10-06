import { useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { projectsApi } from "@/api/endpoints/projects";
import { isApiError } from "@/api/errors";
import { keys, renderChanges } from "@/api/query-keys";
import type { AiCreditSummary, ProjectRender } from "@/api/types";

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

function isGone(err: unknown): boolean {
  return isApiError(err) && err.kind === "http" && (err.status === 404 || err.status === 403);
}

/** When the server started on it, for the elapsed time (now, if it can't be read). */
export function startedAtOf(render: Pick<ProjectRender, "createdAt"> | null | undefined, now: number = Date.now()): number {
  const t0 = serverTime(render?.createdAt);
  return Number.isFinite(t0) && t0 <= now ? t0 : now;
}

/**
 * C24 · one AI image, polled while it is being made. Polls pause while the app is in the
 * background and run at once on return (React Query's focus, wired to AppState); a dropped
 * poll waits for the next one, but "not found" ends it. A finished image is never read
 * again on its own — its picture's address is signed afresh on every read.
 */
export function useRender(projectId: string, renderId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: keys.render(projectId, renderId),
    queryFn: () => projectsApi.render(projectId, renderId),
    enabled: Boolean(projectId && renderId),
    retry: (failures, err) => !isGone(err) && failures < 2,
    staleTime: (q: Query<ProjectRender, Error, ProjectRender, readonly unknown[]>) => (isFinal(q.state.data) ? Infinity : 0),
    refetchInterval: (q: Query<ProjectRender, Error, ProjectRender, readonly unknown[]>) => {
      const render = q.state.data;
      if (isGone(q.state.error) || isFinal(render)) return false;
      return renderPollDelay(Date.now() - startedAtOf(render));
    },
  });

  // Seen being made and now ended: the credits (handed back if it failed), the finished
  // images and the room's options are read again — once.
  const status = query.data?.status;
  const watched = useRef(false);
  useEffect(() => {
    if (!status) return;
    if (!isFinal(query.data)) {
      watched.current = true;
      return;
    }
    if (!watched.current) return;
    watched.current = false;
    for (const queryKey of renderChanges(projectId)) void queryClient.invalidateQueries({ queryKey }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, projectId, queryClient]);

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
