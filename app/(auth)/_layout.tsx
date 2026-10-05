import { Redirect, Stack, type Href } from "expo-router";

import { useAfterSignInTarget } from "@/auth/use-after-sign-in";

/**
 * Signed-out screens (A2–A8). The moment a sign-in completes, the session changes and
 * this layout sends the person on — to the first run, the page they were trying to open
 * (A1), or home. See useAfterSignInTarget.
 */
export default function AuthLayout() {
  const target = useAfterSignInTarget();
  if (target) return <Redirect href={target as Href} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
