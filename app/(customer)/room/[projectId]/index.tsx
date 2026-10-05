import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { BackButton, ErrorState, Screen } from "@/components/ui";
import { stepFor, useRoom, wasPainted } from "@/features/studio/use-room";
import { useTheme } from "@/theme";

/**
 * CR · Open a room. Spec: docs/04-screens-customer.md — "The studio — one room, five steps".
 *
 * Loads the room and goes straight on to the step it is at. Any shade passed along (from
 * C19) goes with it.
 */
export default function OpenRoom() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ projectId: string; shade?: string; brand?: string }>();
  const id = params.projectId ?? "";
  const room = useRoom(id);

  useEffect(() => {
    if (!room.data) return;
    const data = room.data;
    let cancelled = false;
    void wasPainted(id).then((painted) => {
      if (cancelled) return;
      const step = stepFor(data, painted);
      router.replace({
        pathname: `/room/[projectId]/${step}`,
        params: { projectId: id, shade: params.shade, brand: params.brand },
      } as Href);
    });
    return () => {
      cancelled = true;
    };
  }, [room.data, id, router, params.shade, params.brand]);

  if (room.isError) {
    return (
      <Screen>
        <BackButton fallback="/studio" />
        <ErrorState error={room.error} onRetry={() => void room.refetch()} />
      </Screen>
    );
  }
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgDeep }} testID="room-opening">
      <ActivityIndicator color={colors.accentText} />
    </View>
  );
}
