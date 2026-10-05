import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { projectsApi } from "@/api/endpoints/projects";
import { keys } from "@/api/query-keys";

/**
 * How long a run may take before C8 says so: the backend's worst case (two model calls of
 * up to ~3 minutes each, plus a retry) — the website's deadline, 8 minutes.
 */
export const SLOW_AFTER_MS = 480_000;

/** C8: every 2 s, easing to 5 s once the job has run a minute. */
export function pollDelay(elapsedMs: number): number {
  return elapsedMs < 60_000 ? 2_000 : 5_000;
}

/**
 * Poll a room's status while the server works on it, writing each answer into the room's
 * cache entry (so every step sees it). Stops while the app is in the background and
 * polls at once on return; a failed poll just waits for the next one.
 */
export function useSegmentationPoll(id: string, active: boolean, startedAt: number) {
  const queryClient = useQueryClient();
  const started = useRef(startedAt);
  useEffect(() => {
    started.current = startedAt;
  }, [startedAt]);

  useEffect(() => {
    if (!active || !id) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let inFlight = false;

    const poll = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const status = await projectsApi.status(id);
        if (!stopped) queryClient.setQueryData(keys.room(id), status);
      } catch {
        // The next poll tries again.
      } finally {
        inFlight = false;
      }
      schedule();
    };
    const schedule = () => {
      if (stopped || AppState.currentState === "background") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void poll(), pollDelay(Date.now() - started.current));
    };

    schedule();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        if (timer) clearTimeout(timer);
        void poll();
      } else if (next === "background" && timer) {
        clearTimeout(timer);
        timer = null;
      }
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [active, id, queryClient]);
}
