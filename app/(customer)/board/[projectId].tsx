import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { StyleSheet, View } from "react-native";

import { projectsApi } from "@/api/endpoints/projects";
import { keys } from "@/api/query-keys";
import type { ProjectCombo } from "@/api/types";
import {
  BackButton,
  Button,
  Card,
  Disclaimer,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  RemoteImage,
  Screen,
  ShadeCode,
  Skeleton,
  Text,
  useToast,
} from "@/components/ui";
import { shareBoard } from "@/features/boards/board-files";
import { useMadeBoard } from "@/features/boards/made-boards";
import { useShadeScheme } from "@/features/catalogue/use-catalogue";
import { useRoom } from "@/features/studio/use-room";
import { t } from "@/i18n";
import { formatDate } from "@/lib/dates";
import { codesAreUniversal } from "@/lib/shade-codes";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useSubmit } from "@/lib/use-submit";
import { hairline, useTheme } from "@/theme";

/**
 * The room's boards, each with its options in the order they were printed. An option is
 * numbered by its place on its page (as the website does), not its place in this list: a
 * room reopened in the past recorded its second board under the first one's number.
 */
function byBoard(combos: readonly ProjectCombo[]): [number, ProjectCombo[]][] {
  const boards = new Map<number, ProjectCombo[]>();
  for (const c of [...combos].sort((a, b) => a.boardIndex - b.boardIndex || a.pageIndex - b.pageIndex)) {
    boards.set(c.boardIndex, [...(boards.get(c.boardIndex) ?? []), c]);
  }
  return [...boards];
}

/**
 * C25 · Board detail. Spec: docs/04-screens-customer.md — C25.
 *
 * A finished room opens here (CR): its photo, the day its board was taken, and every
 * option on the board with the codes large enough to read out at a counter. Each option
 * leads to an AI image of it; the job, once done, to a review. A board made on this phone
 * can be sent again.
 */
export default function BoardDetail() {
  const router = useRouter();
  const toast = useToast();
  const { colors, radius, space } = useTheme();
  const { projectId: id = "" } = useLocalSearchParams<{ projectId: string }>();
  const room = useRoom(id);
  const combos = useQuery({ queryKey: keys.combos(id), queryFn: () => projectsApi.combos(id), enabled: Boolean(id) });
  const scheme = useShadeScheme();
  const made = useMadeBoard(id);
  const pull = usePullToRefresh(() => Promise.all([room.refetch(), combos.refetch()]));
  const sending = useSubmit();

  const data = room.data;
  const name = data?.name?.trim() || t("rooms.untitled");
  const boards = byBoard(combos.data ?? []);

  let body;
  if (room.isPending || combos.isPending) {
    body = (
      <View style={{ gap: space.md }} testID="board-detail-loading">
        <Skeleton height={200} radius={16} />
        <Skeleton height={140} radius={16} />
      </View>
    );
  } else if (room.isError || combos.isError) {
    body = (
      <ErrorState
        error={room.error ?? combos.error}
        onRetry={() => void Promise.all([room.refetch(), combos.refetch()])}
      />
    );
  } else if (boards.length === 0) {
    body = (
      <EmptyState
        icon="file-text"
        title={t("boardDetail.emptyTitle")}
        body={data?.closedAt ? t("boardDetail.emptyBody") : t("boardDetail.emptyOpenBody")}
        actionLabel={t("boardDetail.seeRoom")}
        onAction={() => router.push({ pathname: "/room/[projectId]/paint", params: { projectId: id } } as Href)}
      />
    );
  } else {
    body = (
      <>
        <Text variant="small" tone="soft">
          {codesAreUniversal(scheme) ? t("boardDetail.codesUniversal") : t("boardDetail.codesShop")}
        </Text>
        {boards.map(([boardIndex, options]) => (
          <View key={boardIndex} style={{ gap: space.sm }}>
            {boards.length > 1 ? (
              <Text variant="label" tone="mute">
                {t("boardDetail.boardN", { n: boardIndex })}
              </Text>
            ) : null}
            {options.map((combo) => (
              <Card key={combo.id}>
                <View style={{ gap: space.sm }} testID={`board-combo-${combo.id}`}>
                  <View style={styles.row}>
                    <Text variant="label" tone="accent" style={styles.fill}>
                      {combo.title?.trim() || t("boardDetail.option", { n: combo.pageIndex + 1 })}
                    </Text>
                    {combo.rendered ? (
                      <Text variant="caption" tone="mute">
                        {t("boardDetail.imageMade")}
                      </Text>
                    ) : null}
                  </View>
                  {combo.shades.map((shade, j) => {
                    const code = shade.hvCode || shade.shadeCode;
                    return (
                      <View key={`${shade.regionId ?? j}`} style={[styles.shade, { borderTopColor: colors.rule }]}>
                        <View style={[styles.chip, { backgroundColor: shade.hex, borderColor: colors.ruleStrong, borderRadius: radius.xs }]} />
                        <View style={[styles.fill, { gap: 2 }]}>
                          <Text variant="small" tone="soft" numberOfLines={1}>
                            {shade.regionLabel?.trim() || "—"}
                          </Text>
                          {shade.shadeName ? <Text variant="small">{shade.shadeName}</Text> : null}
                        </View>
                        {code ? <ShadeCode code={code} size="medium" /> : null}
                      </View>
                    );
                  })}
                  <Button
                    variant="ghost"
                    block={false}
                    icon="image"
                    label={t("boardDetail.makeImage")}
                    onPress={() => router.push({ pathname: "/ai-image/options", params: { projectId: id, comboId: combo.id } })}
                  />
                </View>
              </Card>
            ))}
          </View>
        ))}
      </>
    );
  }

  return (
    <Screen scroll onRefresh={pull.onRefresh} refreshing={pull.refreshing} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <BackButton fallback="/boards" />
      {data ? (
        <>
          <RemoteImage
            url={data.cleanedImageUrl || data.imageUrl}
            style={[styles.photo, { borderRadius: radius.md }]}
            accessibilityLabel={name}
          />
          <View style={{ gap: space.xxs }}>
            <Text variant="title1" accessibilityRole="header">
              {name}
            </Text>
            <Text variant="small" tone="mute">
              {data.closedAt ? t("boardDetail.taken", { date: formatDate(data.closedAt) }) : t("boardDetail.open")}
            </Text>
          </View>
        </>
      ) : null}
      {made ? (
        <Button
          icon="send"
          label={t("boardDetail.sendAgain")}
          loading={sending.busy}
          onPress={() =>
            void sending.run(async () => {
              try {
                await shareBoard(made.file, `${t("board.title")} · ${made.roomName}`);
              } catch {
                toast.show(t("boardDone.sendFailed"), "error");
              }
            })
          }
        />
      ) : null}
      {body}
      {data && boards.length ? (
        <ListGroup>
          <ListRow icon="eye" title={t("boardDetail.seeRoom")} onPress={() => router.push({ pathname: "/room/[projectId]/paint", params: { projectId: id } } as Href)} />
          {data.closedAt ? (
            <ListRow
              icon="star"
              title={t("boardDetail.review")}
              detail={t("boardDetail.reviewHint")}
              onPress={() => router.push({ pathname: "/review/[projectId]", params: { projectId: id } })}
            />
          ) : null}
        </ListGroup>
      ) : null}
      {boards.length ? <Disclaimer kind="shades" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  photo: { width: "100%", aspectRatio: 4 / 3 },
  shade: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: hairline, paddingTop: 10 },
  chip: { width: 36, height: 36, borderWidth: hairline },
});
