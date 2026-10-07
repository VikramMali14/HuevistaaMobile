import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { renderChanges } from "@/api/query-keys";

import { untrackRender, useTrackedRenders } from "./in-flight";
import { isFinal, isGone, renderQuery } from "./use-render";

/**
 * Mounted once under the customer's screens: polls every AI image being made (in-flight.ts)
 * until it ends, then reads again what its end changed — the credits (spent, or handed back
 * when it failed), the finished images and the room's own — so the shelf, C25, Home and the
 * wallet catch up whether or not C24 is still open. Renders nothing.
 */
export function RenderWatcher() {
  const queryClient = useQueryClient();
  const tracked = useTrackedRenders();
  const results = useQueries({ queries: tracked.map((r) => renderQuery(r.projectId, r.renderId, true)) });

  // One line per image: its id and how it stands, so the effect runs when one changes.
  const states = tracked.map((r, i) => {
    const res = results[i];
    const status = isGone(res?.error) ? "GONE" : (res?.data?.status ?? "");
    return `${r.projectId}|${r.renderId}|${status}`;
  });
  const key = states.join(",");

  useEffect(() => {
    for (const line of key ? key.split(",") : []) {
      const [projectId, renderId, status] = line.split("|");
      if (!projectId || !renderId) continue;
      if (status !== "GONE" && !isFinal({ status: status as never })) continue;
      untrackRender(renderId);
      for (const filters of renderChanges(projectId)) void queryClient.invalidateQueries(filters).catch(() => {});
    }
  }, [key, queryClient]);

  return null;
}
