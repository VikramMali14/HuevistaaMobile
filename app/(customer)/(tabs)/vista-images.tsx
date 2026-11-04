import { useRouter } from "expo-router";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { Card, EmptyState, ErrorState, RemoteImage, Screen, Skeleton, Text } from "@/components/ui";
import { PaintSwitch } from "@/features/studio/PaintSwitch";
import { useRenders } from "@/features/rooms/use-rooms";
import { t } from "@/i18n";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

/**
 * The Paint tab's Vista images: every finished, real-looking photo made of this account's
 * rooms, newest first, two across. A press opens the image (C-ai-image). Images still being
 * made are on their room; a failed one has already handed its credits back and is left out.
 * The website's counterpart is /ai-images.
 */
export default function VistaImagesTab() {
  const router = useRouter();
  const { space } = useTheme();
  const { width } = useWindowDimensions();
  const renders = useRenders();
  const pull = usePullToRefresh(renders.refetch);

  const ready = (renders.data ?? [])
    .filter((r) => r.status === "READY" && r.imageUrl)
    .sort((a, b) => (b.completedAt ?? b.createdAt ?? "").localeCompare(a.completedAt ?? a.createdAt ?? ""));
  const gap = space.sm;
  const card = Math.floor((Math.min(width, 640) - space.gutter * 2 - gap) / 2);

  let body;
  if (renders.isPending) {
    body = (
      <View style={[styles.grid, { gap }]} testID="vista-images-loading">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width={card} height={card * 0.75 + 48} radius={16} />
        ))}
      </View>
    );
  } else if (renders.isError && !renders.data) {
    body = <ErrorState error={renders.error} onRetry={() => void renders.refetch()} />;
  } else if (ready.length === 0) {
    body = (
      <EmptyState
        icon="zap"
        title={t("paintTab.imagesEmpty")}
        body={t("paintTab.imagesEmptyBody")}
        actionLabel={t("paintTab.imagesEmptyAction")}
        onAction={() => router.navigate("/studio")}
      />
    );
  } else {
    body = (
      <View style={[styles.grid, { gap }]}>
        {ready.map((r) => (
          <Card
            key={r.id}
            testID={`vista-image-${r.id}`}
            onPress={() => router.push({ pathname: "/ai-image/[renderId]", params: { renderId: r.id, projectId: r.projectId } })}
            accessibilityLabel={`${t("paintTab.images")}, ${r.projectName}`}
            style={{ width: card, padding: 0, overflow: "hidden" }}
          >
            <RemoteImage url={r.imageUrl} style={styles.image} />
            <View style={{ padding: space.sm }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {r.projectName}
              </Text>
            </View>
          </Card>
        ))}
      </View>
    );
  }

  return (
    <Screen scroll edges={["top"]} onRefresh={pull.onRefresh} refreshing={pull.refreshing} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <PaintSwitch value="images" />
      <View style={{ gap: space.xs }}>
        <Text variant="title1" accessibilityRole="header">
          {t("paintTab.imagesTitle")}
        </Text>
        <Text variant="lead">{t("paintTab.imagesLead")}</Text>
      </View>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap" },
  image: { width: "100%", aspectRatio: 4 / 3 },
});
