/**
 * A12: whether the sign-in that just finished asked which side to continue as.
 *
 * A painter or a shop owner whose customer side is on is one person with two sides behind
 * one sign-in, and every sign-in of theirs answers `chooseProfile`. The answer is noted
 * here BEFORE the session opens (finishSignIn), so the moment the signed-out screens see
 * the new session they already know to send the person to the chooser rather than
 * straight to their home. Somebody with one side is never asked.
 *
 * Kept in memory only, like the remembered page: it belongs to this one sign-in, and a
 * sign-out — or the app closing — ends it. The chooser settles it the moment it opens.
 */

let pending = false;

/** The sign-in about to open asked which side to continue as. */
export function askWhichSide(): void {
  pending = true;
}

/** Read without clearing — safe to call during render. */
export function isSideChoicePending(): boolean {
  return pending;
}

/** Asked and answered, or no longer to be asked. */
export function settleSideChoice(): void {
  pending = false;
}
