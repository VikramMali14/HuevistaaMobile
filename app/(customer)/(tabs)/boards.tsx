import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { meApi } from "@/api/endpoints/me";
import { keys } from "@/api/query-keys";
import type { MyRender, RenderableProject, RoomDetail } from "@/api/types";
import { Button, Card, EmptyState, ErrorState, RemoteImage, Screen, Segmented, Skeleton, Text } from "@/components/ui";
import { useTrackedRenders } from "@/features/ai-images/in-flight";
import { isBeingMade, renderQuery } from "@/features/ai-images/use-render";
import { t } from "@/i18n";
import { formatDate } from "@/lib/dates";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

type Tab = "colour" | "ai";

/** Finished rooms first, newest finished first; rooms still open (reopened) after them. */
function newestFirst(a: RenderableProject, b: RenderableProject): number {
  if (Boolean(a.closedAt) !== Boolean(b.closedAt)) return a.closedAt ? -1 : 1;
  return (b.closedAt ?? "").localeCompare(a.closedAt ?? "");
}

/**
 * C4 · Boards. Spec: docs/04-screens-customer.md — C4.
 *
 * What the rooms produced: every room that took a colour board (→ C25), and every finished
 * AI image (→ C24). As built: the boards come from GET /api/me/renderable-projects — the
 * rooms carrying board combinations — because the room list sends no board count. Opened
 * with `?tab=ai` (C24's "All my AI images", "Leave this running") on the AI images.
 */
export default function BoardsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { radius, space } = useTheme();
  const { tab: asked } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(asked === "ai" ? "ai" : "colour");
  // Sent here again with a tab (the tab screen stays mounted): show the one asked for.
  const [seen, setSeen] = useState(asked);
  if (asked !== seen) {
    setSeen(asked);
    if (asked === "ai" || asked === "colour") setTab(asked);
  }
  // Used once, then cleared: sent here again with the same tab, it still shows it.
  useEffect(() => {
    if (asked) router.setParams({ tab: undefined });
  }, [asked, router]);
  const boards = useQuery({ queryKey: keys.boards, queryFn: meApi.renderableProjects });
  const renders = useQuery({ queryKey: keys.renders, queryFn: meApi.renders });
  // The shelf lists finished images only. Those this phone is following while they are made
  // ("Leave this running") show first, as being made, so leaving one doesn't lose it.
  const tracked = useTrackedRenders();
  const trackedReads = useQueries({ queries: tracked.map((r) => renderQuery(r.projectId, r.renderId, false)) });
  const making: MyRender[] = tracked.flatMap((r, i) => {
    const read = trackedReads[i]?.data;
    if (!isBeingMade(read) || renders.data?.some((x) => x.id === r.renderId)) return [];
    const name = boards.data?.find((p) => p.id === r.projectId)?.name ?? queryClient.getQueryData<RoomDetail>(keys.room(r.projectId))?.name ?? "";
    return [{ id: r.renderId, projectId: r.projectId, projectName: name, status: read!.status, imageUrl: null }];
  });
  const pull = usePullToRefresh(() => Promise.all([boards.refetch(), renders.refetch()]));

  let body;
  if (tab === "colour") {
    const list = [...(boards.data ?? [])].sort(newestFirst);
    if (boards.isPending) {
      body = (
        <View style={{ gap: space.sm }} testID="boards-loading">
          {[0, 1].map((i) => (
            <Skeleton key={i} height={96} radius={16} />
          ))}
        </View>
      );
    } else if (boards.isError && !boards.data) {
      body = <ErrorState error={boards.error} onRetry={() => void boards.refetch()} />;
    } else if (list.length === 0) {
      body = (
        <EmptyState
          icon="file-text"
          title={t("boards.emptyBoards")}
          body={t("boards.emptyBoardsBody")}
          actionLabel={t("boards.openRooms")}
          onAction={() => router.push("/studio")}
        />
      );
    } else {
      body = (
        <View style={{ gap: space.sm }}>
          {list.map((room) => {
            const name = room.name?.trim() || t("rooms.untitled");
            const when = room.closedAt ? t("boards.taken", { date: formatDate(room.closedAt) }) : t("boards.open");
            const count = room.comboCount === 1 ? t("boards.oneOption") : t("boards.options", { n: room.comboCount });
            return (
              <Card
                key={room.id}
                onPress={() => router.push({ pathname: "/board/[projectId]", params: { projectId: room.id } })}
                accessibilityLabel={`${name}, ${when}, ${count}`}
              >
                <View style={styles.row} testID={`board-room-${room.id}`}>
                  <RemoteImage url={room.cleanedImageUrl || room.imageUrl} style={[styles.thumb, { borderRadius: radius.sm }]} />
                  <View style={[styles.fill, { gap: 2 }]}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {name}
                    </Text>
                    <Text variant="small" tone="mute">
                      {when}
                    </Text>
                    <Text variant="small" tone="soft">
                      {count}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      );
    }
  } else {
    const images = [...making, ...(renders.data ?? []).filter((r) => r.status !== "FAILED")];
    if (renders.isPending && !making.length) {
      body = (
        <View style={[styles.grid, { gap: space.sm }]} testID="images-loading">
          {[0, 1].map((i) => (
            <Skeleton key={i} width="48%" height={160} radius={16} />
          ))}
        </View>
      );
    } else if (renders.isError && !renders.data && !making.length) {
      body = <ErrorState error={renders.error} onRetry={() => void renders.refetch()} />;
    } else if (images.length === 0) {
      body = (
        <EmptyState
          icon="image"
          title={t("boards.emptyImages")}
          body={t("boards.emptyImagesBody")}
          actionLabel={t("boards.makeImage")}
          onAction={() => router.push("/ai-image/new")}
        />
      );
    } else {
      body = (
        <View style={{ gap: space.md }}>
          <View style={[styles.grid, { gap: space.sm }]}>
            {images.map((image: MyRender) => {
              const room = image.projectName?.trim() || t("rooms.untitled");
              const label = image.status === "READY" ? t("boards.imageLabel", { room }) : t("boards.imageMakingLabel", { room });
              return (
                <Pressable
                  key={image.id}
                  onPress={() => router.push({ pathname: "/ai-image/[renderId]", params: { renderId: image.id, projectId: image.projectId } })}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  style={[styles.tile, { gap: space.xxs }]}
                  testID={`ai-image-${image.id}`}
                >
                  <RemoteImage url={image.status === "READY" ? image.imageUrl : null} style={[styles.image, { borderRadius: radius.md }]} />
                  <Text variant="small" numberOfLines={1}>
                    {image.projectName?.trim() || t("rooms.untitled")}
                  </Text>
                  <Text variant="caption" tone="mute">
                    {image.status === "READY" ? formatDate(image.completedAt ?? image.createdAt) : t("boards.working")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button variant="secondary" icon="image" label={t("boards.makeImage")} onPress={() => router.push("/ai-image/new")} />
        </View>
      );
    }
  }

  return (
    <Screen scroll edges={["top"]} onRefresh={pull.onRefresh} refreshing={pull.refreshing} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <Text variant="title1" accessibilityRole="header" style={{ marginTop: space.md }}>
        {t("boards.title")}
      </Text>
      <Segmented
        accessibilityLabel={t("boards.title")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "colour", label: t("boards.colour") },
          { value: "ai", label: t("boards.ai") },
        ]}
      />
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  thumb: { width: 88, height: 66 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  tile: { width: "48%" },
  image: { width: "100%", aspectRatio: 4 / 3 },
});
