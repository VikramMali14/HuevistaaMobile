import { Stack } from "expo-router";

import { useTheme } from "@/theme";

/**
 * One room's studio (C8–C18).
 *
 * TODO(Phase 3): load the room once here (GET /api/projects/{id}) with React Query, so
 * every step reads it from the cache instead of fetching it again.
 */
export default function RoomLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgDeep } }}>
      <Stack.Screen name="suggestions" options={{ presentation: "modal" }} />
      <Stack.Screen name="share" options={{ presentation: "modal" }} />
      <Stack.Screen name="report" options={{ presentation: "modal" }} />
    </Stack>
  );
}
