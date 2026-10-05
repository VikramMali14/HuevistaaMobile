import { Redirect, useGlobalSearchParams, usePathname, useSegments } from "expo-router";
import type { ReactElement } from "react";
import { View } from "react-native";

import type { UserProfile } from "@/api/types";
import { useTheme } from "@/theme";

import { rememberRoute } from "./pending-route";
import { homeFor } from "./routing";
import { useSession } from "./session";

/** The current path with its query, e.g. "/room/abc/paint?from=share". */
function useCurrentHref(): string {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  // Route params ([projectId]) are already in the pathname; everything else is query.
  const routeParams = new Set(
    (useSegments() as string[]).filter((s) => s.startsWith("[")).map((s) => s.replace(/^\[(\.\.\.)?|\]$/g, "")),
  );
  const query = Object.entries(params)
    .filter(([key, value]) => value !== undefined && !routeParams.has(key))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * The guard every protected route group's `_layout.tsx` uses. Returns what to render
 * INSTEAD of the group (a redirect, or an empty page while the session is still being
 * restored), or `null` when the person may enter.
 *
 *   const blocked = useGuard((p) => p.role === "CUSTOMER");
 *   if (blocked) return blocked;
 *
 * A signed-out person is sent to Welcome, and the page they asked for is remembered so
 * sign-in can bring them back to it (A1).
 */
export function useGuard(allow: (profile: UserProfile) => boolean): ReactElement | null {
  const { state } = useSession();
  const { colors } = useTheme();
  const href = useCurrentHref();

  switch (state.status) {
    case "loading":
      // The splash normally covers this; never flash the wrong screen.
      return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
    case "unreachable":
      return <Redirect href="/" />;
    case "signedOut":
      // A link opened while signed out, or a session that ran out: come back here after
      // sign-in. Not after "Sign out" — whoever signs in next may be someone else.
      if (!state.byChoice) rememberRoute(href);
      return <Redirect href="/welcome" />;
    case "signedIn":
      return allow(state.profile) ? null : <Redirect href={homeFor(state.profile)} />;
  }
}
