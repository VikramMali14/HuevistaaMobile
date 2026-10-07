import { Stack } from "expo-router";

import { useGuard } from "@/auth/guards";
import { RenderWatcher } from "@/features/ai-images/RenderWatcher";
import { useTheme } from "@/theme";

/**
 * The homeowner's app — CUSTOMER accounts only. The tabs sit at the bottom of this
 * stack; every other customer screen is pushed over them, which is what hides the tab
 * bar inside the studio. RenderWatcher follows each AI image being made until it ends,
 * whichever of these screens is showing.
 */
export default function CustomerLayout() {
  const { colors, radius } = useTheme();
  const blocked = useGuard((profile) => profile.role === "CUSTOMER");
  if (blocked) return blocked;

  return (
    <>
      <RenderWatcher />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        {/* C12: opens at half height so the room stays visible above it. */}
        <Stack.Screen
          name="shade-picker"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: [0.5, 0.85],
            sheetGrabberVisible: true,
            sheetCornerRadius: radius.lg,
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
        <Stack.Screen name="checkout" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}
