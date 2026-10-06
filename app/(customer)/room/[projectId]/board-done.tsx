import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";

import { Banner, BackButton, Button, Disclaimer, EmptyState, ListGroup, ListRow, Screen, Text, useToast } from "@/components/ui";
import { boardUri, saveBoardToPhone, shareBoard } from "@/features/boards/board-files";
import { madeBoardsLoaded, useMadeBoard } from "@/features/boards/made-boards";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { hairline, useTheme } from "@/theme";

/**
 * C16 · Board ready. Spec: docs/04-screens-customer.md — C16.
 *
 * The board just made, page by page, with the one thing to do with it — send it on — and
 * what comes next. As built: Send the board opens the phone's share sheet (WhatsApp is
 * there); there is no way to hand a file to one app alone without native code, so there
 * is no separate WhatsApp button. Save to phone writes a copy into a folder the person
 * picks on Android (a PDF is not a photo, so not the gallery). A board handed over on a
 * charge that went unanswered says so: its options were kept, to be made again.
 */
export default function BoardReady() {
  const router = useRouter();
  const toast = useToast();
  const { colors, radius, space } = useTheme();
  const { projectId: id = "" } = useLocalSearchParams<{ projectId: string }>();
  const board = useMadeBoard(id);
  const [ready, setReady] = useState(false);
  const sending = useSubmit();
  const saving = useSubmit();

  useEffect(() => {
    let live = true;
    void madeBoardsLoaded().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);

  if (!board) {
    if (!ready) {
      return (
        <View style={[styles.fill, styles.center, { backgroundColor: colors.bg }]}>
          <ActivityIndicator color={colors.accentText} />
        </View>
      );
    }
    return (
      <Screen>
        <BackButton fallback="/studio" />
        <EmptyState
          icon="file-text"
          title={t("boardDone.missingTitle")}
          body={t("boardDone.missingBody")}
          actionLabel={t("boardDone.seeOptions")}
          onAction={() => router.replace({ pathname: "/board/[projectId]", params: { projectId: id } } as Href)}
        />
      </Screen>
    );
  }

  const title = `${t("board.title")} · ${board.roomName}`;
  const send = () =>
    void sending.run(async () => {
      try {
        await shareBoard(board.file, title);
      } catch {
        toast.show(t("boardDone.sendFailed"), "error");
      }
    });
  const save = () =>
    void saving.run(async () => {
      try {
        if (await saveBoardToPhone(board.file, title)) toast.show(t("boardDone.saved"), "success");
      } catch {
        toast.show(t("boardDone.saveFailed"), "error");
      }
    });

  return (
    <Screen scroll contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <BackButton fallback="/studio" />
      <View style={{ gap: space.xs }}>
        <Text variant="title1" accessibilityRole="header">
          {t("boardDone.title")}
        </Text>
        <Text variant="lead">
          {board.options === 1
            ? board.pageCount === 1
              ? t("boardDone.leadOnePage")
              : t("boardDone.leadOne", { pages: board.pageCount })
            : t("boardDone.lead", { options: board.options, pages: board.pageCount })}
        </Text>
      </View>

      {board.unrecorded ? <Banner tone="warning" message={t("boardDone.unrecorded")} testID="board-unrecorded" /> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {board.pages.map((uri, i) => (
          <View
            key={`${i}`}
            accessible
            accessibilityRole="image"
            accessibilityLabel={t("boardDone.page", { n: i + 1 })}
            style={[styles.page, { borderColor: colors.ruleStrong, borderRadius: radius.sm, backgroundColor: colors.surfaceSoft }]}
          >
            {uri ? (
              <Image source={{ uri: boardUri(uri) }} style={styles.fill} contentFit="cover" />
            ) : (
              <View style={[styles.fill, styles.row]}>
                {(board.swatches?.[i] ?? []).map((hex, j) => (
                  <View key={`${j}`} style={[styles.fill, { backgroundColor: hex }]} />
                ))}
              </View>
            )}
            <Text variant="caption" tone="mute" style={[styles.pageNo, { backgroundColor: `${colors.bg}e6` }]}>
              {t("boardDone.page", { n: i + 1 })}
            </Text>
          </View>
        ))}
        {board.pageCount > board.pages.length ? (
          // The reward page that closes the board: its QR is for the shop, the painter and you.
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${t("boardDone.page", { n: board.pageCount })}, ${t("boardDone.rewardPage")}`}
            style={[
              styles.page,
              styles.center,
              { borderColor: colors.ruleStrong, borderRadius: radius.sm, backgroundColor: colors.surface, gap: space.xs, padding: space.sm, paddingBottom: 32 },
            ]}
          >
            <Feather name="maximize" size={36} color={colors.fgSoft} />
            <Text variant="caption" tone="mute" align="center">
              {t("boardDone.rewardPage")}
            </Text>
            <Text variant="caption" tone="mute" style={[styles.pageNo, { backgroundColor: `${colors.bg}e6` }]}>
              {t("boardDone.page", { n: board.pageCount })}
            </Text>
          </View>
        ) : null}
      </ScrollView>
      {board.rewardMissing ? (
        <Text variant="small" tone="mute">
          {t("boardDone.noReward")}
        </Text>
      ) : null}

      {board.closedRoom ? <Banner tone="info" message={t("boardDone.closedNote")} /> : null}

      <View style={{ gap: space.xs }}>
        <Button label={t("boardDone.send")} icon="send" onPress={send} loading={sending.busy} testID="board-send" />
        <Text variant="small" tone="mute" align="center">
          {t("boardDone.sendHint")}
        </Text>
        <Button variant="secondary" label={t("boardDone.save")} icon="download" onPress={save} loading={saving.busy} testID="board-save" />
      </View>

      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="mute">
          {t("boardDone.next")}
        </Text>
        <ListGroup>
          <ListRow icon="image" title={t("boardDone.aiImage")} onPress={() => router.push({ pathname: "/ai-image/new", params: { projectId: id } })} />
          <ListRow icon="map-pin" title={t("boardDone.painter")} onPress={() => router.push("/nearby")} />
          <ListRow
            icon="grid"
            title={t("boardDone.rooms")}
            // Back to the tabs already there, rather than a second copy of them.
            onPress={() => (router.canDismiss() ? router.dismissTo("/studio") : router.replace("/studio"))}
          />
        </ListGroup>
      </View>

      <Disclaimer kind="shades" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row" },
  page: { width: 132, height: 187, borderWidth: hairline, overflow: "hidden" },
  pageNo: { position: "absolute", bottom: 6, left: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
});
