import { Stack } from "expo-router";

import { useTheme } from "@/theme";

/**
 * One room's studio (C8–C18). Every step reads the room with `useRoom()` — one query-cache
 * entry (`GET /api/projects/{id}`) shared by all of them, which C8's poll keeps current.
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
