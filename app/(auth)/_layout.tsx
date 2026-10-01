import { Redirect, Stack } from "expo-router";

import { homeFor } from "@/auth/routing";
import { useSession } from "@/auth/session";

/** Signed-out screens (A2–A8). A signed-in person is sent to where they belong. */
export default function AuthLayout() {
  const { state } = useSession();
  if (state.status === "signedIn") return <Redirect href={homeFor(state.profile)} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
