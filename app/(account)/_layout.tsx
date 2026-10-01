import { Stack } from "expo-router";

import { useGuard } from "@/auth/guards";

/** Account screens both roles use (S1–S10). Any signed-in account. */
export default function AccountLayout() {
  const blocked = useGuard(() => true);
  if (blocked) return blocked;
  return <Stack screenOptions={{ headerShown: false }} />;
}
