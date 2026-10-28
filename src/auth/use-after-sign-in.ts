import { useEffect, useMemo } from "react";

import type { UserProfile } from "@/api/types";

import { forgetRememberedRoute, peekRememberedRoute } from "./pending-route";
import { homeFor } from "./routing";
import { useSession } from "./session";
import { isSideChoicePending } from "./side-choice";

/** A12, where a sign-in that asked which side to continue as goes first. */
export const CHOOSE_SIDE_ROUTE = "/choose-profile";

/**
 * Where to send someone the moment a sign-in completes, or null while signed out:
 * - a painter or shop owner on two sides → A12, which asks which to continue as first;
 * - a brand-new account → the first run (the remembered page waits until it is over);
 * - otherwise → the page they were trying to open before signing in (A1), or home.
 *
 * Shared by the (auth) layout and the Google callback, which lives outside that group.
 */
export function useAfterSignInTarget(): string | null {
  const { state } = useSession();
  return useOnwardRoute(state.status === "signedIn" ? state.profile : null, isSideChoicePending());
}

/**
 * Where to go next for `profile`, or null without one: A12 when `chooseSide`, else the
 * first run, the page remembered from before sign-in, or home. The remembered page is
 * forgotten once it is the destination; the first run and A12 keep it for afterwards.
 * A12 itself uses this once the choice is made.
 */
export function useOnwardRoute(
  profile: Pick<UserProfile, "role" | "namePending" | "welcomePending"> | null,
  chooseSide = false,
): string | null {
  const home = profile ? homeFor(profile) : null;
  // Fixed per destination, so forgetting the remembered page below cannot move a redirect
  // that is already on its way.
  const target = useMemo(() => {
    if (!home) return null;
    if (chooseSide) return CHOOSE_SIDE_ROUTE;
    return home !== "/about-you" ? (peekRememberedRoute() ?? home) : home;
  }, [home, chooseSide]);

  useEffect(() => {
    // The remembered page has been used once it is the destination; the first run and the
    // question before it keep it.
    if (target && target !== "/about-you" && target !== CHOOSE_SIDE_ROUTE) forgetRememberedRoute();
  }, [target]);

  return target;
}

/** The end of the first run (A10 / A11): the remembered page, once, or home. */
export function takeRememberedRoute(): string | null {
  const path = peekRememberedRoute();
  forgetRememberedRoute();
  return path;
}
