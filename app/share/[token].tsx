import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isApiError, messageFor } from "@/api/errors";
import { projectsApi } from "@/api/endpoints/projects";
import { shareApi, type SharedRoom } from "@/api/endpoints/share";
import { mediaSource } from "@/api/media";
import { keys } from "@/api/query-keys";
import { rememberRoute } from "@/auth/pending-route";
import { homeFor } from "@/auth/routing";
import { useSession } from "@/auth/session";
import { BackButton, Banner, Button, ConfirmSheet, Disclaimer, EmptyState, ErrorState, IconButton, Text, ZoomView } from "@/components/ui";
import { SharedPalette } from "@/features/share/SharedPalette";
import { sharedColours, sharedWalls, shareTokenFrom } from "@/features/share/shared-room";
import { canvasWalls, roomPhoto } from "@/features/studio/canvas-walls";
import { CanvasTrouble } from "@/features/studio/CanvasTrouble";
import { RoomCanvas, type CanvasState, type RoomCanvasHandle } from "@/features/studio/engine/RoomCanvas";
import type { WallColour } from "@/features/studio/paint-store";
import { canvasUrl } from "@/features/studio/use-room";
import { wallLabel } from "@/features/studio/wall-plan";
import { t } from "@/i18n";
import { formatServerDate } from "@/lib/dates";
import { useSubmit } from "@/lib/use-submit";
import { hairline, useTheme } from "@/theme";

const gone = (err: unknown) => isApiError(err) && err.kind === "http" && err.status === 404;

/**
 * D2 · A shared room. Spec: docs/06-screens-shared.md — D2. Web reference:
 * HueVistaFrontEnd app/share/[token]/ (page.tsx, share-repaint.tsx, claim-shared-room.tsx).
 *
 * Public: the room shows and can be repainted with no sign-in, in the companies the link
 * offers. The visitor's colours live in this screen only — nothing is saved to anyone's
 * room. A customer can copy it into their own rooms (it spends one, after a plain
 * confirm, and is never asked twice by itself); its owner is sent to their own room
 * instead; anyone signed out is signed in and brought back to press Save themselves.
 * A link that has stopped and a server that didn't answer are told apart.
 */
export default function SharedRoomScreen() {
  const { token: raw } = useLocalSearchParams<{ token: string }>();
  const token = shareTokenFrom(raw);
  const room = useQuery({
    queryKey: keys.sharedRoom(token ?? ""),
    queryFn: () => shareApi.room(token!),
    enabled: Boolean(token),
    retry: (failures, err) => !gone(err) && failures < 2,
    staleTime: 5 * 60_000,
  });

  if (!token) return <Ended title={t("sharedRoom.badLink")} />;
  if (room.data) return <Repaint token={token} room={room.data} />;
  if (gone(room.error)) return <Ended title={t("sharedRoom.goneTitle")} body={t("sharedRoom.goneBody")} />;
  if (room.isError) return <Unavailable onRetry={() => void room.refetch()} />;
  return <Loading />;
}

function Loading() {
  const { colors } = useTheme();
  return (
    <View style={[styles.fill, styles.center, { backgroundColor: colors.bgDeep }]} testID="shared-loading">
      <ActivityIndicator color={colors.accentText} />
    </View>
  );
}

function useHome(): Href {
  const { state } = useSession();
  return (state.status === "signedIn" ? homeFor(state.profile) : "/welcome") as Href;
}

function Ended({ title, body }: { title: string; body?: string }) {
  const router = useRouter();
  const home = useHome();
  const { space, colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { backgroundColor: colors.bg, paddingTop: insets.top, paddingHorizontal: space.gutter }]} testID="shared-gone">
      <BackButton fallback={home} />
      <EmptyState icon="link-2" title={title} body={body} actionLabel={t("sharedRoom.home")} onAction={() => router.replace(home)} />
    </View>
  );
}

function Unavailable({ onRetry }: { onRetry: () => void }) {
  const home = useHome();
  const { space, colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { backgroundColor: colors.bg, paddingTop: insets.top, paddingHorizontal: space.gutter, gap: space.lg }]} testID="shared-unavailable">
      <BackButton fallback={home} />
      <Text variant="title1" accessibilityRole="header">
        {t("sharedRoom.unavailableTitle")}
      </Text>
      <ErrorState message={t("sharedRoom.unavailableBody")} onRetry={onRetry} />
    </View>
  );
}

function Repaint({ token, room }: { token: string; room: SharedRoom }) {
  const home = useHome();
  const { colors, radius, space } = useTheme();
  const insets = useSafeAreaInsets();
  const canvasRef = useRef<RoomCanvasHandle>(null);
  const walls = sharedWalls(room);
  const shared = sharedColours(room);
  const [colours, setColours] = useState<Record<string, WallColour>>(shared);
  const [selected, setSelected] = useState<string | null>(walls[0] ? String(walls[0].id) : null);
  const [holding, setHolding] = useState(false);
  const [canvas, setCanvas] = useState<CanvasState>({ kind: "loading" });
  const [choosing, setChoosing] = useState(false);

  const scheme = room.shadeCodeScheme ?? { showNames: false, showBrands: false, showRealCodes: false };
  const photo = roomPhoto(room);
  // Cached apart from the owner's own room, so the two never mix on one phone.
  const shown = canvasWalls(
    room,
    (r) => {
      const c = colours[String(r.id)];
      return { hex: c?.hex ?? null, lrv: c?.lrv };
    },
    (regionId) => shareApi.maskPath(token, regionId),
    `share:${token}`,
  ).filter((w) => walls.some((r) => String(r.id) === w.id));
  const selectedWall = walls.find((w) => String(w.id) === selected) ?? null;
  const changed = JSON.stringify(colours) !== JSON.stringify(shared);
  const noGl = canvas.kind === "noGl";

  return (
    <View style={[styles.fill, { backgroundColor: colors.bgDeep, paddingTop: insets.top }]} testID="shared-room">
      <View style={[styles.top, { paddingHorizontal: space.xs }]}>
        <BackButton fallback={home} />
        <Text variant="bodyStrong" numberOfLines={1} style={styles.title} accessibilityRole="header">
          {room.name?.trim() || t("sharedRoom.eyebrow")}
        </Text>
        <IconButton icon="rotate-ccw" label={t("sharedRoom.reset")} onPress={() => setColours(shared)} disabled={!changed} testID="shared-reset" />
      </View>
      <View style={{ paddingHorizontal: space.gutter, gap: 2, paddingBottom: space.xs }}>
        <Text variant="label" tone="accent">
          {t("sharedRoom.eyebrow")}
        </Text>
        <Text variant="small" tone="soft">
          {t("sharedRoom.lead")}
          {room.shareExpiresAt ? ` ${t("sharedRoom.until", { date: formatServerDate(room.shareExpiresAt) })}` : ""}
        </Text>
      </View>

      <View style={styles.fill}>
        {noGl ? (
          <Image source={mediaSource(canvasUrl(room))} style={styles.fill} contentFit="contain" accessibilityLabel={room.name} />
        ) : (
          <ZoomView resetKey={photo.key}>
            <RoomCanvas
              ref={canvasRef}
              photo={photo.load}
              photoKey={photo.key}
              walls={shown}
              cleaned={Boolean(room.cleanedImageUrl)}
              showOriginal={holding}
              onState={setCanvas}
              onTapWall={(wall) => wall && walls.some((w) => String(w.id) === wall) && setSelected(wall)}
              onHold={setHolding}
              accessibilityLabel={t("sharedRoom.canvasLabel")}
              testID="shared-canvas"
            />
          </ZoomView>
        )}
        <View pointerEvents="box-none" style={[styles.overlay, { padding: space.gutter, gap: space.xs }]}>
          {noGl ? <Banner tone="info" message={t("sharedRoom.noGl")} /> : <CanvasTrouble state={canvas} onRetry={() => canvasRef.current?.retry()} />}
        </View>
      </View>
      {holding ? (
        <View pointerEvents="none" style={[styles.beforePill, { top: insets.top + 64, backgroundColor: `${colors.bg}e6`, borderRadius: radius.pill }]}>
          <Text variant="small">{t("paint.original")}</Text>
        </View>
      ) : null}

      <View style={[styles.dock, { backgroundColor: colors.bg, paddingBottom: insets.bottom + space.sm, borderTopColor: colors.rule }]}>
        {walls.length === 0 ? (
          <Text variant="body" tone="soft" style={{ paddingHorizontal: space.gutter }} testID="shared-no-walls">
            {t("sharedRoom.noWalls")}
          </Text>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.gutter }}>
              {walls.map((w) => {
                const key = String(w.id);
                const c = colours[key];
                const on = selected === key;
                const label = wallLabel(w) || t("sharedRoom.wall");
                return (
                  <Pressable
                    key={key}
                    onPress={() => setSelected(key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${label}, ${c?.code ?? t("sharedRoom.original")}`}
                    style={[
                      styles.wallChip,
                      { borderRadius: radius.pill, borderColor: on ? colors.fg : colors.ruleStrong, backgroundColor: on ? colors.surfaceSoft : colors.surface },
                    ]}
                    testID={`wall-${key}`}
                  >
                    <View style={[styles.wallDot, { backgroundColor: c?.hex ?? "transparent", borderColor: colors.ruleStrong }]} />
                    <Text variant="small" numberOfLines={1}>
                      {label}
                    </Text>
                    <Text variant="caption" tone="mute">
                      {c?.code ?? t("sharedRoom.original")}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {noGl ? null : (
              <View style={{ paddingHorizontal: space.gutter }}>
                <Button
                  icon="droplet"
                  label={selectedWall ? t("sharedRoom.chooseFor", { wall: wallLabel(selectedWall) || t("sharedRoom.wall") }) : t("sharedRoom.choose")}
                  variant="secondary"
                  onPress={() => setChoosing(true)}
                  disabled={!selectedWall}
                  testID="shared-choose"
                />
              </View>
            )}
          </>
        )}
        <View style={{ paddingHorizontal: space.gutter, gap: space.xs }}>
          <SaveAction token={token} room={room} />
          <Disclaimer kind="shades" />
        </View>
      </View>

      {selectedWall ? (
        <SharedPalette
          token={token}
          visible={choosing}
          wallName={wallLabel(selectedWall) || t("sharedRoom.wall")}
          scheme={scheme}
          onClose={() => setChoosing(false)}
          onPick={(colour) => {
            setColours((now) => ({ ...now, [String(selectedWall.id)]: colour }));
            setChoosing(false);
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * What the visitor can do with it: a customer copies it (one room, confirmed first); its
 * owner opens their own; signed out, sign in and come back. Shops and painters only look.
 */
function SaveAction({ token, room }: { token: string; room: SharedRoom }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { state } = useSession();
  const customer = state.status === "signedIn" && state.profile.role === "CUSTOMER";
  // Whether it's the viewer's own room: their own room answers; anyone else's is a 404.
  const mine = useQuery({
    queryKey: [...keys.sharedRoom(token), "mine", room.id],
    queryFn: () => projectsApi.get(room.id),
    enabled: customer,
    retry: false,
    staleTime: Infinity,
  });
  const saving = useSubmit();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [short, setShort] = useState(false);

  if (state.status === "signedOut") {
    return (
      <Button
        icon="plus"
        label={t("sharedRoom.signInToSave")}
        onPress={() => {
          // Back here after signing in, to press Save — never saved by itself: it spends a room.
          rememberRoute(`/share/${encodeURIComponent(token)}`);
          router.push("/welcome");
        }}
        testID="shared-sign-in"
      />
    );
  }
  if (!customer || mine.isPending) return null;
  if (mine.data) {
    return (
      <Button
        icon="arrow-right"
        label={t("sharedRoom.openYours")}
        onPress={() => router.push({ pathname: "/room/[projectId]", params: { projectId: room.id } } as Href)}
        testID="shared-open-mine"
      />
    );
  }

  const save = () =>
    void saving.run(async () => {
      setError(null);
      setShort(false);
      try {
        const copy = await shareApi.claim(token);
        setConfirming(false);
        for (const key of [keys.projects, keys.entitlement, keys.projectOptions]) void queryClient.invalidateQueries({ queryKey: key });
        router.replace({ pathname: "/room/[projectId]/paint", params: { projectId: copy.id } } as Href);
      } catch (err) {
        if (isApiError(err) && err.kind === "http" && err.status === 404) {
          setConfirming(false);
          setError(t("sharedRoom.gone"));
          void queryClient.invalidateQueries({ queryKey: keys.sharedRoom(token), exact: true });
          return;
        }
        if (isApiError(err) && err.kind === "http" && err.status < 500) {
          setShort(err.status === 402);
          setError(messageFor(err, t("sharedRoom.saveFailed")));
          return;
        }
        // No answer: it may have been copied, and copying again would spend another room.
        void queryClient.invalidateQueries({ queryKey: keys.projects });
        setConfirming(false);
        setError(t("sharedRoom.unanswered"));
      }
    });

  const unanswered = error === t("sharedRoom.unanswered");
  return (
    <View style={{ gap: 8 }}>
      {error && !confirming ? (
        <Banner tone={unanswered ? "warning" : "danger"} message={error} testID="shared-save-error">
          {unanswered ? <Button variant="ghost" block={false} label={t("sharedRoom.yourRooms")} onPress={() => router.push("/studio")} /> : null}
          {short ? <Button variant="ghost" block={false} label={t("sharedRoom.getRooms")} onPress={() => router.push("/balance")} /> : null}
        </Banner>
      ) : null}
      {unanswered ? null : (
        <Button
          icon="plus"
          label={t("sharedRoom.save")}
          onPress={() => {
            setError(null);
            setConfirming(true);
          }}
          testID="shared-save"
        />
      )}
      <ConfirmSheet
        visible={confirming}
        title={t("sharedRoom.confirmTitle")}
        body={t("sharedRoom.confirmBody")}
        consequences={[t("sharedRoom.saveBody")]}
        confirmLabel={t("sharedRoom.confirm")}
        loading={saving.busy}
        error={error}
        onConfirm={save}
        onCancel={() => setConfirming(false)}
        testID="shared-confirm"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: 2 },
  title: { flex: 1, marginHorizontal: 4 },
  beforePill: { position: "absolute", alignSelf: "center", paddingHorizontal: 14, paddingVertical: 6 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0 },
  dock: { paddingTop: 10, gap: 10, borderTopWidth: hairline },
  wallChip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, minHeight: 40 },
  wallDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1 },
});
