import { useEffect, useMemo } from "react";

import { forgetRememberedRoute, peekRememberedRoute } from "./pending-route";
import { homeFor } from "./routing";
import { useSession } from "./session";

/**
 * Where to send someone the moment a sign-in completes, or null while signed out:
 * - a brand-new account → the first run (the remembered page waits until it is over);
 * - otherwise → the page they were trying to open before signing in (A1), or home.
 *
 * Shared by the (auth) layout and the Google callback, which lives outside that group.
 */
export function useAfterSignInTarget(): string | null {
  const { state } = useSession();
  const home = state.status === "signedIn" ? homeFor(state.profile) : null;
  // Fixed per destination, so forgetting the remembered page below cannot move a redirect
  // that is already on its way.
  const target = useMemo(
    () => (home && home !== "/about-you" ? (peekRememberedRoute() ?? home) : home),
    [home],
  );

  useEffect(() => {
    // The remembered page has been used once it is the destination; the first run keeps it.
    if (target && target !== "/about-you") forgetRememberedRoute();
  }, [target]);

  return target;
}

/** The end of the first run (A10 / A11): the remembered page, once, or home. */
export function takeRememberedRoute(): string | null {
  const path = peekRememberedRoute();
  forgetRememberedRoute();
  return path;
}
