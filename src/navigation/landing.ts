import { isRememberablePath } from "@/auth/pending-route";

/**
 * Where the app's first screen sends a signed-in person next time, once, in place of
 * home: S1 again after a change of language remounts every screen, or the screen a
 * notification was tapped for when it started the app. Memory only — a fresh start
 * goes home.
 */
let next: string | null = null;

export function landNextOn(path: string): void {
  if (isRememberablePath(path)) next = path;
}

export function peekLanding(): string | null {
  return next;
}

export function clearLanding(): void {
  next = null;
}
