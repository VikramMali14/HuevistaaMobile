import { Stack } from "expo-router";

import { useGuard } from "@/auth/guards";

/** The first run (A10–A11). Any signed-in account. */
export default function OnboardingLayout() {
  const blocked = useGuard(() => true);
  if (blocked) return blocked;
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}
