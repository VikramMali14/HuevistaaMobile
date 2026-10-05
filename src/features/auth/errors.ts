import { isApiError, messageFor } from "@/api/errors";

/**
 * The sentence for a failed sign-in call.
 *
 * Sign-in endpoints answer without a session, so their 401 and 403 are not "your
 * session ended" — they carry their own reason ("That account is closed…", "Admin
 * accounts sign in with an email and password…", "Incorrect code. 2 attempts left.").
 * Those are written for people, so they are shown as they are. Everything else (no
 * network, 429, 5xx) goes through the app-wide messageFor.
 */
export function authErrorMessage(err: unknown): string {
  if (isApiError(err) && err.kind === "http" && err.status >= 400 && err.status < 500 && err.status !== 429) {
    if (err.message) return err.message;
  }
  return messageFor(err);
}

/** The server's message for one field, if it sent one. */
export function fieldError(err: unknown, field: string): string | null {
  return isApiError(err) ? (err.fieldErrors?.[field] ?? null) : null;
}
