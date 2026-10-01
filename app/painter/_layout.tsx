import { Stack } from "expo-router";

import { useGuard } from "@/auth/guards";
import { useTheme } from "@/theme";

/** The painter's app — PAINTER accounts only (docs/05-screens-painter.md). */
export default function PainterLayout() {
  const { colors } = useTheme();
  const blocked = useGuard((profile) => profile.role === "PAINTER");
  if (blocked) return blocked;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
