import type { UserProfile } from "@/api/types";

/** The routes a signed-in person can be sent to first. */
export type HomeRoute = "/about-you" | "/home" | "/painter" | "/web-only";

/**
 * Where a signed-in person belongs. The ONLY place the role decision is made — every
 * guard and the start-up screen call this. See docs/01-product.md "One app, routed by role".
 */
export function homeFor(profile: Pick<UserProfile, "role" | "namePending" | "welcomePending">): HomeRoute {
  const firstRun = Boolean(profile.namePending || profile.welcomePending);
  switch (profile.role) {
    case "CUSTOMER":
      return firstRun ? "/about-you" : "/home";
    case "PAINTER":
      return firstRun ? "/about-you" : "/painter";
    default:
      // Shops, distributors and admins work on the website (S10).
      return "/web-only";
  }
}
