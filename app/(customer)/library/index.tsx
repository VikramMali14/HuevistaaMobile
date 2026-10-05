import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import {
  BackButton,
  EmptyState,
  ErrorState,
  Screen,
  Segmented,
  Skeleton,
  Text,
} from "@/components/ui";
import { LibraryCard } from "@/features/library/LibraryCard";
import { useLibrary } from "@/features/library/use-library";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

type Space = "all" | "INTERIOR" | "EXTERIOR";

/**
 * C20 · Ready-made rooms. Spec: docs/04-screens-customer.md — C20.
 *
 * Rooms the HueVistaa team photographed and marked, to paint free. Indoor / Outdoor
 * only when the shelf has both.
 */
export default function LibraryScreen() {
  const router = useRouter();
  const { space } = useTheme();
  const { width } = useWindowDimensions();
  const library = useLibrary();
  const [where, setWhere] = useState<Space>("all");

  const spaces = new Set(library.rooms.map((r) => (r.space === "EXTERIOR" ? "EXTERIOR" : "INTERIOR")));
  const shown = where === "all" ? library.rooms : library.rooms.filter((r) => (r.space === "EXTERIOR" ? "EXTERIOR" : "INTERIOR") === where);
  const gap = space.sm;
  const card = Math.floor((Math.min(width, 640) - space.gutter * 2 - gap) / 2);

  let body;
  if (library.isPending) {
    body = (
      <View style={[styles.grid, { gap }]} testID="library-loading">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width={card} height={card * 0.75 + 64} radius={16} />
        ))}
      </View>
    );
  } else if (library.isError && !library.data) {
    body = <ErrorState error={library.error} onRetry={() => void library.refetch()} />;
  } else if (!library.live) {
    body = <EmptyState icon="image" title={t("library.empty")} body={t("library.emptyBody")} />;
  } else {
    body = (
      <View style={[styles.grid, { gap }]}>
        {shown.map((room) => (
          <LibraryCard key={room.slug} room={room} width={card} onPress={() => router.push(`/library/${room.slug}`)} />
        ))}
      </View>
    );
  }

  return (
    <Screen scroll onRefresh={() => void library.refetch()} refreshing={library.isRefetching} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <BackButton fallback="/home" />
      <View style={{ gap: space.xs }}>
        <Text variant="title1" accessibilityRole="header">
          {t("library.title")}
        </Text>
        <Text variant="lead">{t("library.lead")}</Text>
      </View>
      {spaces.size > 1 ? (
        <Segmented
          accessibilityLabel={t("library.title")}
          options={[
            { value: "all", label: t("library.all") },
            { value: "INTERIOR", label: t("library.indoor") },
            { value: "EXTERIOR", label: t("library.outdoor") },
          ]}
          value={where}
          onChange={setWhere}
        />
      ) : null}
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap" },
});
