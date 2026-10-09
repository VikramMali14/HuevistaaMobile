import { isRememberablePath } from "@/auth/pending-route";

/**
 * Where the app's first screen sends a signed-in person next time, once, in place of
 * home: S1 again after a change of language remounts every screen, or the screen a
 * notification was tapped for when it started the app. Memory only — a fresh start
 * goes home.
 */
let next: { path: string; forUser?: string } | null = null;

/** `forUser`: only for that account (a notification's) — anyone else goes home as usual. */
export function landNextOn(path: string, forUser?: string): void {
  if (isRememberablePath(path)) next = { path, forUser };
}

export function peekLanding(userId: string): string | null {
  if (!next || (next.forUser && next.forUser !== userId)) return null;
  return next.path;
}

export function clearLanding(): void {
  next = null;
}
