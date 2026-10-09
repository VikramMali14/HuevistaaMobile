/**
 * A1 step 5: where a signed-out person was trying to go.
 *
 * When a guard turns someone away because they are not signed in, it remembers the page
 * they asked for. After sign-in (and the first run, if there is one) the app takes them
 * there instead of to their home screen — a link to a room keeps working through the
 * sign-in it needed.
 *
 * Kept in memory only: it is a convenience for this run of the app, and it must never
 * outlive a sign-out (see forgetRememberedRoute in session sign-out paths).
 */

/**
 * Never worth returning to: the sign-in and first-run screens themselves, the web-only
 * screen (it belongs to the account's role, not to a link), and the root, which only
 * routes by session. The root matters with a query too — while a guard's
 * redirect is under way it can render once more at "/?projectId=…", and that must not
 * replace the page that was really asked for.
 */
const NOT_A_DESTINATION =
  /^\/((welcome|phone|phone-code|email-sign-in|register|forgot-password|email-code|sign-in|about-you|tour|web-only|dev)(\/|\?|$)|\?|$)/;

let remembered: string | null = null;

/**
 * Only an in-app path is accepted: it must start with one slash, so nothing that came
 * in on a link can send the app to another scheme, host or `//evil.example`.
 */
export function isRememberablePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 1 &&
    path.length <= 512 &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !NOT_A_DESTINATION.test(path)
  );
}

export function rememberRoute(path: string): void {
  if (!isRememberablePath(path)) return;
  // While a guard's redirect is on its way, the router can report only the guarded
  // layout's own segment, with the page's params as a query ("/painter?token=…" for
  // "/painter/claim/…"). That's the same visit, not a new page: the deeper path stays.
  if (remembered && remembered.split("?")[0]!.startsWith(`${path.split("?")[0]}/`)) return;
  remembered = path;
}

/** Read without clearing — safe to call during render. */
export function peekRememberedRoute(): string | null {
  return remembered;
}

export function forgetRememberedRoute(): void {
  remembered = null;
}
