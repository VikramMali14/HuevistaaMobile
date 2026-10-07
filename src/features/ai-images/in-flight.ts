import { useSyncExternalStore } from "react";

/**
 * The AI images being made that this run of the app knows of — asked for here (C23), or
 * opened while still being made (C24). RenderWatcher polls each until it ends, wherever the
 * customer has gone, so the end reaches the shelf, the room and the wallet without C24
 * having to stay open.
 */
export interface TrackedRender {
  projectId: string;
  renderId: string;
}

let tracked: readonly TrackedRender[] = [];
const listeners = new Set<() => void>();
/** By image: when this phone asked for it, or first saw it being made (its own clock). */
const since = new Map<string, number>();
const askedHere = new Set<string>();

function emit() {
  for (const l of listeners) l();
}

export function trackRender(projectId: string, renderId: string, askedAt?: number) {
  if (askedAt !== undefined) {
    askedHere.add(renderId);
    since.set(renderId, askedAt);
  } else if (!since.has(renderId)) {
    since.set(renderId, Date.now());
  }
  if (tracked.some((r) => r.renderId === renderId)) return;
  tracked = [...tracked, { projectId, renderId }];
  emit();
}

export function untrackRender(renderId: string) {
  if (!tracked.some((r) => r.renderId === renderId)) return;
  tracked = tracked.filter((r) => r.renderId !== renderId);
  emit();
}

export function useTrackedRenders(): readonly TrackedRender[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => tracked,
    () => tracked,
  );
}

/** This phone asked for it, in this run. */
export function wasAskedHere(renderId: string): boolean {
  return askedHere.has(renderId);
}

/** The longest an image is made for before the server ends it (failed, credits back). */
const LONGEST_MS = 25 * 60_000;

/**
 * When it started, by the phone's clock — steady from one render to the next. The ask's
 * own moment when it was asked here; otherwise the server's time, kept between the first
 * sight of it and the longest an image can run before that, so a phone clock that is off
 * can neither make the wait start again nor make it look ancient.
 */
export function startedAtFor(renderId: string, serverStart: number, now: number = Date.now()): number {
  if (!since.has(renderId)) since.set(renderId, now);
  const seen = since.get(renderId)!;
  if (askedHere.has(renderId)) return seen;
  if (!Number.isFinite(serverStart)) return seen;
  return Math.min(seen, Math.max(seen - LONGEST_MS, serverStart));
}

/** Forget them all (sign-out, or a switch of profile). */
export function resetInFlight() {
  tracked = [];
  since.clear();
  askedHere.clear();
  emit();
}
