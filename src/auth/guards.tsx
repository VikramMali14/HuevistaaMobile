import { Redirect } from "expo-router";
import type { ReactElement } from "react";
import { View } from "react-native";

import type { UserProfile } from "@/api/types";
import { useTheme } from "@/theme";

import { homeFor } from "./routing";
import { useSession } from "./session";

/**
 * The guard every protected route group's `_layout.tsx` uses. Returns what to render
 * INSTEAD of the group (a redirect, or an empty page while the session is still being
 * restored), or `null` when the person may enter.
 *
 *   const blocked = useGuard((p) => p.role === "CUSTOMER");
 *   if (blocked) return blocked;
 */
export function useGuard(allow: (profile: UserProfile) => boolean): ReactElement | null {
  const { state } = useSession();
  const { colors } = useTheme();

  switch (state.status) {
    case "loading":
      // The splash normally covers this; never flash the wrong screen.
      return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
    case "unreachable":
      return <Redirect href="/" />;
    case "signedOut":
      return <Redirect href="/welcome" />;
    case "signedIn":
      return allow(state.profile) ? null : <Redirect href={homeFor(state.profile)} />;
  }
}
