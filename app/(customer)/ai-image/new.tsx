import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { meApi } from "@/api/endpoints/me";
import { projectsApi } from "@/api/endpoints/projects";
import { isApiError } from "@/api/errors";
import { keys } from "@/api/query-keys";
import { BackButton, Card, EmptyState, ErrorState, RemoteImage, Screen, Skeleton, Text } from "@/components/ui";
import { ComboCard } from "@/features/ai-images/ComboCard";
import { byBoard, finishedImages } from "@/features/boards/combos";
import { useRoom } from "@/features/studio/use-room";
import { t } from "@/i18n";
import { formatDate } from "@/lib/dates";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

/**
 * C22 · AI image — choose the room. Spec: docs/04-screens-customer.md — C22.
 *
 * The rooms that have taken a colour board (GET /api/me/renderable-projects, in the
 * server's order: finished first, then rooms still open), then the option to photograph
 * (GET /api/projects/{id}/combos). Opened with `projectId` (C16), it goes straight to that
 * room's options; a room with one option goes straight on to C23.
 */
export default function AiImageChooseRoom() {
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  return projectId ? <ChooseOption projectId={projectId} /> : <ChooseRoom />;
}

function ChooseRoom() {
  const router = useRouter();
  const { radius, space } = useTheme();
  const rooms = useQuery({ queryKey: keys.boards, queryFn: meApi.renderableProjects });
  const pull = usePullToRefresh(() => rooms.refetch());

  let body;
  if (rooms.isPending) {
    body = (
      <View style={{ gap: space.sm }} testID="ai-rooms-loading">
        {[0, 1].map((i) => (
          <Skeleton key={i} height={96} radius={16} />
        ))}
      </View>
    );
  } else if (rooms.isError && !rooms.data) {
    body = <ErrorState error={rooms.error} onRetry={() => void rooms.refetch()} />;
  } else if (rooms.data.length === 0) {
    body = (
      <EmptyState
        icon="image"
        title={t("aiImage.emptyTitle")}
        body={t("aiImage.emptyBody")}
        actionLabel={t("aiImage.openRooms")}
        onAction={() => router.push("/studio")}
      />
    );
  } else {
    body = (
      <View style={{ gap: space.sm }}>
        {rooms.data.map((room) => {
          const name = room.name?.trim() || t("rooms.untitled");
          const count = room.comboCount === 1 ? t("boards.oneOption") : t("boards.options", { n: room.comboCount });
          const when = room.closedAt ? t("aiImage.finished", { date: formatDate(room.closedAt) }) : t("aiImage.stillOpen");
          return (
            <Card
              key={room.id}
              onPress={() => router.push({ pathname: "/ai-image/new", params: { projectId: room.id } })}
              accessibilityLabel={`${name}, ${count}, ${when}`}
            >
              <View style={[styles.row, { gap: space.sm }]} testID={`ai-room-${room.id}`}>
                {/* The cleaned photo where there is one: what the image is painted from. */}
                <RemoteImage url={room.cleanedImageUrl || room.imageUrl} style={[styles.thumb, { borderRadius: radius.sm }]} />
                <View style={[styles.fill, { gap: 2 }]}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {name}
                  </Text>
                  <Text variant="small" tone="soft">
                    {count}
                  </Text>
                  <Text variant="small" tone="mute">
                    {when}
                  </Text>
                </View>
              </View>
            </Card>
          );
        })}
      </View>
    );
  }

  return (
    <Screen scroll onRefresh={pull.onRefresh} refreshing={pull.refreshing} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <BackButton fallback="/boards" />
      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="accent">
          {t("aiImage.title")}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {t("aiImage.chooseRoom")}
        </Text>
        {rooms.data?.length ? (
          <Text variant="body" tone="soft">
            {t("aiImage.chooseRoomLead")}
          </Text>
        ) : null}
      </View>
      {body}
    </Screen>
  );
}

function ChooseOption({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { space } = useTheme();
  const room = useRoom(projectId);
  const combos = useQuery({ queryKey: keys.combos(projectId), queryFn: () => projectsApi.combos(projectId) });
  const renders = useQuery({ queryKey: keys.roomRenders(projectId), queryFn: () => projectsApi.renders(projectId) });
  const pull = usePullToRefresh(() => Promise.all([combos.refetch(), renders.refetch()]));
  const forwarded = useRef(false);

  const list = combos.data ?? [];
  // One option: nothing to choose, so on to its choices (this screen steps out of the way).
  const only = combos.isSuccess && list.length === 1 ? list[0]! : null;
  useEffect(() => {
    if (!only || forwarded.current) return;
    forwarded.current = true;
    router.replace({ pathname: "/ai-image/options", params: { projectId, comboId: only.id } });
  }, [only, projectId, router]);

  const gone = isApiError(combos.error) && combos.error.kind === "http" && combos.error.status === 404;
  const boards = byBoard(list);
  const made = finishedImages(renders.data);
  const name = room.data?.name?.trim() || null;

  let body;
  if (combos.isPending || only) {
    body = (
      <View style={{ gap: space.sm }} testID="ai-options-loading">
        {[0, 1].map((i) => (
          <Skeleton key={i} height={120} radius={16} />
        ))}
      </View>
    );
  } else if (gone) {
    body = (
      <EmptyState
        icon="image"
        title={t("aiImage.roomGone")}
        actionLabel={t("aiImage.seeRooms")}
        onAction={() => router.replace("/ai-image/new")}
      />
    );
  } else if (combos.isError && !combos.data) {
    body = <ErrorState error={combos.error} onRetry={() => void combos.refetch()} />;
  } else if (list.length === 0) {
    body = (
      <EmptyState
        icon="file-text"
        title={t("aiImage.noOptionsTitle")}
        body={t("aiImage.noOptionsBody")}
        actionLabel={t("aiImage.openRoom")}
        onAction={() => router.push({ pathname: "/room/[projectId]", params: { projectId } } as Href)}
      />
    );
  } else {
    body = (
      <View style={{ gap: space.md }}>
        {boards.map(([boardIndex, options]) => (
          <View key={boardIndex} style={{ gap: space.sm }}>
            {options.map((combo) => {
              const image = made.get(combo.id);
              return (
                <ComboCard
                  key={combo.id}
                  combo={combo}
                  board={boards.length > 1 ? t("boardDetail.boardN", { n: boardIndex }) : null}
                  badge={image ? t("aiImage.imageMade") : null}
                  onPress={() => router.push({ pathname: "/ai-image/options", params: { projectId, comboId: combo.id } })}
                  testID={`ai-option-${combo.id}`}
                />
              );
            })}
          </View>
        ))}
      </View>
    );
  }

  return (
    <Screen scroll onRefresh={pull.onRefresh} refreshing={pull.refreshing} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <BackButton fallback="/ai-image/new" />
      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="accent">
          {name ?? t("aiImage.title")}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {t("aiImage.chooseOption")}
        </Text>
        {list.length > 1 ? (
          <Text variant="body" tone="soft">
            {t("aiImage.chooseOptionLead")}
          </Text>
        ) : null}
      </View>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center" },
  thumb: { width: 84, height: 84 },
});
