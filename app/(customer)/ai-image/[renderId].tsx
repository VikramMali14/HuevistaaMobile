import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { meApi } from "@/api/endpoints/me";
import { projectsApi } from "@/api/endpoints/projects";
import { mediaSource } from "@/api/media";
import { keys } from "@/api/query-keys";
import type { ProjectCombo, ProjectRender } from "@/api/types";
import {
  BackButton,
  Banner,
  Button,
  Disclaimer,
  EmptyState,
  ErrorState,
  IconButton,
  ListGroup,
  ListRow,
  Screen,
  Skeleton,
  Text,
  useToast,
  WorkingState,
  ZoomView,
} from "@/components/ui";
import { ComboCard } from "@/features/ai-images/ComboCard";
import { renderFailure } from "@/features/ai-images/failure";
import { wasAskedHere } from "@/features/ai-images/in-flight";
import {
  openPhotoSettings,
  PictureNotFetched,
  renderBytes,
  renderFile,
  saveRenderToPhotos,
  sharePdf,
  shareRender,
} from "@/features/ai-images/render-files";
import { choicesOf, describeRender } from "@/features/ai-images/render-options";
import { isBeingMade, LONG_AFTER_MS, refundSeen, SLOW_AFTER_MS, startedAtOf, useRender } from "@/features/ai-images/use-render";
import { comboPdfShades } from "@/features/boards/combos";
import { namesShown, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { useRoom } from "@/features/studio/use-room";
import { t } from "@/i18n";
import { announce } from "@/lib/announce";
import { pdfPrintable } from "@/lib/pdf-core";
import { buildAiImagePdf, isReadableJpeg } from "@/lib/pdf-export";
import { codesAreUniversal } from "@/lib/shade-codes";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/** The picture's share of the screen, so Send and Save stay in reach under a tall one. */
const PICTURE_MAX_SHARE = 0.5;

/**
 * C24 · AI image — working and result. Spec: docs/04-screens-customer.md — C24.
 *
 * While it is being made, RenderWatcher polls it (QUEUED and RUNNING look the same: the
 * customer is told how long it has taken, never a status), and it can be left — it is on
 * the AI images shelf once ready. Ready: the picture (tap for full screen, pinch to zoom),
 * then Send the image (the phone's share sheet, where WhatsApp is — a file reaches WhatsApp
 * no other way without native code, as on C16), Save to phone (the photos, asked for only
 * now), and a one-page PDF with its shades. Failed: the server's own sentence (which says
 * the credits are back); Try again is a new image, with the same choices and note, and
 * says so. An image not on this account: said plainly.
 */
export default function AiImageResult() {
  const router = useRouter();
  const { renderId = "", projectId: given } = useLocalSearchParams<{ renderId: string; projectId?: string }>();
  // A link without its room (an old one): the finished images, read now, say which room it is.
  const shelf = useQuery({ queryKey: keys.renders, queryFn: meApi.renders, enabled: !given, refetchOnMount: "always" });
  const projectId = given || shelf.data?.find((r) => r.id === renderId)?.projectId || "";
  const render = useRender(projectId, renderId);
  // Back to the tabs already there, on the AI images — never a second set of tabs.
  const toImages = () => {
    const to = { pathname: "/boards", params: { tab: "ai" } } as const;
    if (router.canDismiss()) router.dismissTo(to);
    else router.replace(to);
  };

  const data = render.data;
  const working = isBeingMade(data);
  // "Being made", from an earlier visit's memory: checked with the server before it is shown.
  const unconfirmed = working && !render.isFetchedAfterMount && !wasAskedHere(renderId) && render.isFetching;
  // Seen being made on this screen: its arrival is worth a tap of the hand.
  const [waited, setWaited] = useState(false);
  if (working && !unconfirmed && !waited) setWaited(true);

  const unknownRoom = !given && shelf.isSuccess && !shelf.isFetching && !projectId;
  if (unknownRoom || render.gone) {
    return (
      <Screen>
        <BackButton fallback="/boards" />
        <EmptyState icon="image" title={t("aiImage.goneTitle")} body={t("aiImage.goneBody")} actionLabel={t("aiImage.seeImages")} onAction={toImages} />
      </Screen>
    );
  }
  if (!data || unconfirmed) {
    // Kept on screen while it tries again, rather than flicking between the two.
    const failed = (render.isError && !data) || (!given && shelf.isError && !shelf.data);
    return (
      <Screen>
        <BackButton fallback="/boards" />
        {failed ? (
          <ErrorState error={render.error ?? shelf.error} onRetry={() => void (given || projectId ? render.refetch() : shelf.refetch())} />
        ) : (
          <View style={[styles.fill, styles.center]} testID="ai-image-loading">
            <ActivityIndicator />
          </View>
        )}
      </Screen>
    );
  }

  if (working) {
    return <Working render={data} onLeave={toImages} />;
  }
  if (data.status === "FAILED") {
    return <Failed render={data} projectId={projectId} />;
  }
  return (
    <Ready
      render={data}
      projectId={projectId}
      refresh={async () => (await render.refetch()).data ?? data}
      toImages={toImages}
      celebrate={waited}
    />
  );
}

function Working({ render, onLeave }: { render: ProjectRender; onLeave: () => void }) {
  const { space } = useTheme();
  const startedAt = startedAtOf(render);
  // The words change as it runs long; WorkingState keeps its own clock for the time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = now - startedAt;
  const sentence = elapsed >= LONG_AFTER_MS ? t("aiImage.workingLong") : elapsed >= SLOW_AFTER_MS ? t("aiImage.workingSlow") : t("aiImage.workingBody");
  return (
    <Screen>
      <BackButton fallback="/boards" />
      <View style={[styles.fill, { justifyContent: "center", paddingBottom: space.xl }]} testID="ai-image-working">
        <WorkingState stage={t("aiImage.working")} sentence={sentence} startedAt={startedAt} onLeave={onLeave} />
      </View>
    </Screen>
  );
}

function Failed({ render, projectId }: { render: ProjectRender; projectId: string }) {
  const router = useRouter();
  const { space } = useTheme();
  const wallet = useQuery({ queryKey: keys.aiCredits, queryFn: meApi.aiCredits });
  const message = renderFailure(render.failureReason, refundSeen(wallet.data, render));
  // The same choices, and the customer's own note: the next one is asked for as this one was.
  const tryAgain = () =>
    render.comboId
      ? router.replace({
          pathname: "/ai-image/options",
          params: { projectId, comboId: render.comboId, ...choicesOf(render), ...(render.note ? { note: render.note } : {}) },
        })
      : router.replace({ pathname: "/ai-image/new", params: { projectId } });
  const home = () => (router.canDismiss() ? router.dismissTo("/home") : router.replace("/home"));
  useEffect(() => announce(message), [message]);
  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          <Button label={t("payment.tryAgain")} onPress={tryAgain} testID="ai-try-again" />
          <Button variant="ghost" label={t("common.goHome")} onPress={home} />
        </View>
      }
    >
      <BackButton fallback="/boards" />
      <View style={[styles.fill, { justifyContent: "center", gap: space.md }]} testID="ai-image-failed" accessibilityLiveRegion="polite">
        <Text variant="title1" accessibilityRole="header">
          {t("aiImage.failedTitle")}
        </Text>
        <Banner tone="danger" message={message} />
        <Text variant="small" tone="mute">
          {t("aiImage.tryAgainNote")}
        </Text>
      </View>
    </Screen>
  );
}

function Ready({
  render,
  projectId,
  refresh,
  toImages,
  celebrate,
}: {
  render: ProjectRender;
  projectId: string;
  /** Read the image again — for a fresh picture address once the old one has expired. */
  refresh: () => Promise<ProjectRender>;
  toImages: () => void;
  /** It finished while the customer watched. */
  celebrate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { colors, radius, space } = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const room = useRoom(projectId);
  const combos = useQuery({ queryKey: keys.combos(projectId), queryFn: () => projectsApi.combos(projectId) });
  const scheme = useShadeScheme();
  const [ratio, setRatio] = useState(4 / 3);
  const [loadFailures, setLoadFailures] = useState(0);
  const [denied, setDenied] = useState(false);
  const [full, setFull] = useState(false);
  const sending = useSubmit();
  const saving = useSubmit();
  const pdfing = useSubmit();

  // A success the customer waited for is felt as well as seen, and said (once).
  useEffect(() => {
    if (!celebrate) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    announce(t("aiImage.ready"));
  }, [celebrate]);

  const roomName = room.data?.name?.trim() || t("rooms.untitled");
  const combo = render.comboId ? (combos.data?.find((c) => c.id === render.comboId) ?? null) : null;
  const caption = describeRender(render);
  /** The room's name as it is when sent — read in if this screen hasn't got it yet. */
  const nameNow = async (): Promise<string> => {
    try {
      const data = await queryClient.ensureQueryData({ queryKey: keys.room(projectId), queryFn: () => projectsApi.get(projectId) });
      return data.name?.trim() || t("rooms.untitled");
    } catch {
      return roomName;
    }
  };
  /** Its option as it is when the PDF is made — read in if this screen hasn't got it yet. */
  const comboNow = async (): Promise<ProjectCombo | null> => {
    if (!render.comboId) return null;
    const list = await queryClient.ensureQueryData({ queryKey: keys.combos(projectId), queryFn: () => projectsApi.combos(projectId) });
    return list.find((c) => c.id === render.comboId) ?? null;
  };
  const source = mediaSource(render.imageUrl);
  const picture = source ? { ...source, cacheKey: `render-${render.id}` } : null;

  /** The picture on the phone; once more with a fresh address if the first has expired. */
  const file = async (): Promise<string> => {
    try {
      return await renderFile(render.imageUrl ?? "", render.id);
    } catch {
      const fresh = await refresh();
      return renderFile(fresh.imageUrl ?? "", render.id);
    }
  };
  /** A failure to fetch the picture is said as such — not blamed on the phone, nor on Send. */
  const fail = (err: unknown, otherwise: string) =>
    toast.show(err instanceof PictureNotFetched ? t("aiImage.fetchFailed") : otherwise, "error");

  const send = () =>
    void sending.run(async () => {
      try {
        const uri = await file();
        await shareRender(uri, `${t("aiImage.pdfTitle")} · ${await nameNow()}`);
      } catch (err) {
        fail(err, t("aiImage.sendFailed"));
      }
    });
  const save = () =>
    void saving.run(async () => {
      try {
        const result = await saveRenderToPhotos(await file());
        setDenied(result === "denied");
        if (result === "saved") toast.show(t("aiImage.saved"), "success");
      } catch (err) {
        fail(err, t("aiImage.saveFailed"));
      }
    });
  const pdf = () =>
    void pdfing.run(async () => {
      // Its shades are what the PDF is for: never one without them while it has an option.
      let option: ProjectCombo | null;
      try {
        option = await comboNow();
      } catch {
        option = null;
      }
      if (render.comboId && !option) {
        toast.show(t("aiImage.pdfNoShades"), "error");
        return;
      }
      try {
        const jpeg = await renderBytes(await file());
        // A picture the PDF can't place would leave a page with no image on it.
        if (!isReadableJpeg(jpeg)) throw new Error("Not a JPEG");
        const name = await nameNow();
        const printedName = pdfPrintable(name) ? name : t("board.pdfTitle");
        const bytes = buildAiImagePdf(
          { jpeg, shades: option ? comboPdfShades(option, namesShown(scheme)) : [], caption },
          printedName,
          codesAreUniversal(scheme),
        );
        await sharePdf(bytes, render.id, name, `${t("aiImage.pdfTitle")} · ${name}`);
      } catch (err) {
        fail(err, t("aiImage.pdfFailed"));
      }
    });

  // Its own option, known from the image (not waiting on the room's options to load), with
  // the same choices and note; an option gone from the board says so there.
  const another = () =>
    render.comboId
      ? router.push({
          pathname: "/ai-image/options",
          params: { projectId, comboId: render.comboId, ...choicesOf(render), ...(render.note ? { note: render.note } : {}) },
        })
      : router.push({ pathname: "/ai-image/new", params: { projectId } });

  const alt = combo
    ? t("aiImage.imageAlt", { room: roomName, option: caption || roomName })
    : t("aiImage.imageAltPlain", { room: roomName });
  const shown = picture && loadFailures < 2;

  return (
    <Screen
      scroll
      footer={
        <View style={{ gap: space.xs }}>
          {denied ? (
            <Banner tone="warning" message={t("aiImage.savePermission")} testID="ai-save-denied">
              <Button variant="ghost" block={false} label={t("aiImage.openSettings")} onPress={openPhotoSettings} />
            </Banner>
          ) : null}
          <Button label={t("aiImage.send")} icon="send" onPress={send} loading={sending.busy} testID="ai-send" />
          <Button variant="secondary" label={t("aiImage.save")} icon="download" onPress={save} loading={saving.busy} testID="ai-save" />
        </View>
      }
      contentStyle={{ gap: space.lg, paddingBottom: space.xl }}
    >
      <BackButton fallback="/boards" />
      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="accent">
          {room.data ? roomName : t("aiImage.title")}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {t("aiImage.ready")}
        </Text>
        {caption ? (
          <Text variant="body" tone="soft">
            {caption}
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.frame,
          { aspectRatio: ratio, maxHeight: screenHeight * PICTURE_MAX_SHARE, borderRadius: radius.md, backgroundColor: colors.surfaceSoft },
        ]}
        testID="ai-image-picture"
      >
        {shown ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setFull(true)}
            accessibilityRole="imagebutton"
            accessibilityLabel={alt}
            accessibilityHint={t("aiImage.viewFull")}
          >
            <Image
              // Keyed by the image, not its address: the address is signed afresh on every read.
              source={picture}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              transition={200}
              onLoad={(e) => {
                const { width, height } = e.source;
                if (width > 0 && height > 0) setRatio(width / height);
              }}
              onError={() => {
                // Once for a fresh address (the old one may have expired), then say so.
                setLoadFailures((n) => n + 1);
                if (loadFailures === 0) void refresh();
              }}
            />
          </Pressable>
        ) : (
          <View style={[styles.fill, styles.center, { gap: space.sm, padding: space.md }]}>
            <Text variant="small" tone="soft" align="center">
              {t("aiImage.loadFailed")}
            </Text>
            <Button
              variant="secondary"
              block={false}
              label={t("common.retry")}
              onPress={() => {
                setLoadFailures(0);
                void refresh();
              }}
              testID="ai-image-reload"
            />
          </View>
        )}
      </View>
      <Text variant="small" tone="mute" align="center">
        {t("aiImage.sendHint")}
      </Text>

      <ListGroup>
        <ListRow icon="file-text" title={t("aiImage.pdf")} onPress={pdf} busy={pdfing.busy} testID="ai-pdf" />
        <ListRow icon="image" title={t("aiImage.another")} onPress={another} testID="ai-another" />
        <ListRow icon="grid" title={t("aiImage.allImages")} onPress={toImages} />
      </ListGroup>

      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="mute">
          {t("aiImage.shadesTitle")}
        </Text>
        {!render.comboId ? (
          <Text variant="small" tone="soft">
            {t("aiImage.shadesGone")}
          </Text>
        ) : combo ? (
          <ComboCard combo={combo} />
        ) : combos.isError ? (
          <Banner tone="warning" message={t("aiImage.shadesFailed")}>
            <Button variant="ghost" block={false} label={t("common.retry")} onPress={() => void combos.refetch()} />
          </Banner>
        ) : (
          <Skeleton height={96} radius={16} />
        )}
      </View>

      <Disclaimer kind="ai" />
      <Disclaimer kind="shades" />

      {picture ? <FullPicture visible={full} source={picture} label={alt} resetKey={render.id} onClose={() => setFull(false)} /> : null}
    </Screen>
  );
}

/** The picture full screen, where nothing scrolls under the fingers: pinch to zoom, two to pan. */
function FullPicture({
  visible,
  source,
  label,
  resetKey,
  onClose,
}: {
  visible: boolean;
  source: NonNullable<ReturnType<typeof mediaSource>>;
  label: string;
  resetKey: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} supportedOrientations={["portrait"]}>
      <View style={[styles.fill, styles.dark]} testID="ai-image-full">
        <ZoomView resetKey={`${resetKey}-${visible}`} style={styles.fill}>
          <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={label} />
        </ZoomView>
        <View style={[styles.close, { top: insets.top + 8 }]}>
          <IconButton icon="x" label={t("aiImage.closeFull")} onPress={onClose} variant="onPhoto" testID="ai-image-close" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  frame: { width: "100%", overflow: "hidden", alignSelf: "center" },
  dark: { backgroundColor: "#000" },
  close: { position: "absolute", right: 12 },
});
