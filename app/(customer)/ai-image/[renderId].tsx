import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { meApi } from "@/api/endpoints/me";
import { projectsApi } from "@/api/endpoints/projects";
import { mediaSource } from "@/api/media";
import { keys } from "@/api/query-keys";
import type { ProjectRender } from "@/api/types";
import {
  BackButton,
  Banner,
  Button,
  Disclaimer,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  Screen,
  Text,
  useToast,
  WorkingState,
  ZoomView,
} from "@/components/ui";
import { ComboCard } from "@/features/ai-images/ComboCard";
import { renderFailure } from "@/features/ai-images/failure";
import { openPhotoSettings, renderBytes, renderFile, saveRenderToPhotos, sharePdf, shareRender } from "@/features/ai-images/render-files";
import { choicesOf, describeRender } from "@/features/ai-images/render-options";
import { LONG_AFTER_MS, refundSeen, SLOW_AFTER_MS, startedAtOf, useRender } from "@/features/ai-images/use-render";
import { comboPdfShades } from "@/features/boards/combos";
import { namesShown, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { useRoom } from "@/features/studio/use-room";
import { t } from "@/i18n";
import { pdfPrintable } from "@/lib/pdf-core";
import { buildAiImagePdf, isReadableJpeg } from "@/lib/pdf-export";
import { codesAreUniversal } from "@/lib/shade-codes";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/**
 * C24 · AI image — working and result. Spec: docs/04-screens-customer.md — C24.
 *
 * Polled while it is being made (QUEUED and RUNNING look the same: the customer is told
 * how long it has taken, never a status), and it can be left — it is on the AI images
 * shelf once ready. Ready: the picture, pinch to zoom, then Send the image (the phone's
 * share sheet, where WhatsApp is — a file reaches WhatsApp no other way without native
 * code, as on C16), Save to phone (the photos, asked for only now), and a one-page PDF
 * with its shades. Failed: the server's own sentence (which says the credits are back);
 * Try again is a new image and says so. An image not on this account: said plainly.
 */
export default function AiImageResult() {
  const router = useRouter();
  const { renderId = "", projectId: given } = useLocalSearchParams<{ renderId: string; projectId?: string }>();
  // A link without its room (an old one): the finished images say which room it is.
  const shelf = useQuery({ queryKey: keys.renders, queryFn: meApi.renders, enabled: !given });
  const projectId = given || shelf.data?.find((r) => r.id === renderId)?.projectId || "";
  const render = useRender(projectId, renderId);
  const toImages = () => router.navigate({ pathname: "/boards", params: { tab: "ai" } });

  const data = render.data;
  // Seen being made on this screen: its arrival is worth a tap of the hand.
  const [waited, setWaited] = useState(false);
  const working = data?.status === "QUEUED" || data?.status === "RUNNING";
  if (working && !waited) setWaited(true);
  const unknownRoom = !given && shelf.isSuccess && !projectId;
  if (unknownRoom || render.gone) {
    return (
      <Screen>
        <BackButton fallback="/boards" />
        <EmptyState icon="image" title={t("aiImage.goneTitle")} body={t("aiImage.goneBody")} actionLabel={t("aiImage.seeImages")} onAction={toImages} />
      </Screen>
    );
  }
  if (!data) {
    const failed = (render.isError && !render.isFetching) || (!given && shelf.isError);
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
  const tryAgain = () =>
    render.comboId
      ? router.replace({ pathname: "/ai-image/options", params: { projectId, comboId: render.comboId, ...choicesOf(render) } })
      : router.replace({ pathname: "/ai-image/new", params: { projectId } });
  const home = () => (router.canDismiss() ? router.dismissTo("/home") : router.replace("/home"));
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
  const room = useRoom(projectId);
  const combos = useQuery({ queryKey: keys.combos(projectId), queryFn: () => projectsApi.combos(projectId) });
  const scheme = useShadeScheme();
  const [ratio, setRatio] = useState(4 / 3);
  const [loadFailures, setLoadFailures] = useState(0);
  const [denied, setDenied] = useState(false);
  const sending = useSubmit();
  const saving = useSubmit();
  const pdfing = useSubmit();

  // A success the customer waited for is felt as well as seen (once).
  useEffect(() => {
    if (celebrate) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
  const source = mediaSource(render.imageUrl);

  /** The picture on the phone; once more with a fresh address if the first has expired. */
  const file = async (): Promise<string> => {
    try {
      return await renderFile(render.imageUrl ?? "", render.id);
    } catch {
      const fresh = await refresh();
      return renderFile(fresh.imageUrl ?? "", render.id);
    }
  };

  const send = () =>
    void sending.run(async () => {
      try {
        const uri = await file();
        await shareRender(uri, `${t("aiImage.pdfTitle")} · ${await nameNow()}`);
      } catch {
        toast.show(t("aiImage.sendFailed"), "error");
      }
    });
  const save = () =>
    void saving.run(async () => {
      try {
        const result = await saveRenderToPhotos(await file());
        setDenied(result === "denied");
        if (result === "saved") toast.show(t("aiImage.saved"), "success");
      } catch {
        toast.show(t("aiImage.saveFailed"), "error");
      }
    });
  const pdf = () =>
    void pdfing.run(async () => {
      try {
        const jpeg = await renderBytes(await file());
        // A picture the PDF can't place would leave a page with no image on it.
        if (!isReadableJpeg(jpeg)) throw new Error("Not a JPEG");
        const name = await nameNow();
        const printedName = pdfPrintable(name) ? name : t("board.pdfTitle");
        const bytes = buildAiImagePdf(
          { jpeg, shades: combo ? comboPdfShades(combo, namesShown(scheme)) : [], caption },
          printedName,
          codesAreUniversal(scheme),
        );
        await sharePdf(bytes, render.id, name, `${t("aiImage.pdfTitle")} · ${name}`);
      } catch {
        toast.show(t("aiImage.pdfFailed"), "error");
      }
    });

  const another = () =>
    combo
      ? router.push({ pathname: "/ai-image/options", params: { projectId, comboId: combo.id, ...choicesOf(render) } })
      : router.push({ pathname: "/ai-image/new", params: { projectId } });

  const alt = combo
    ? t("aiImage.imageAlt", { room: roomName, option: caption || roomName })
    : t("aiImage.imageAltPlain", { room: roomName });

  return (
    <Screen scroll contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
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
        style={[styles.frame, { aspectRatio: ratio, borderRadius: radius.md, backgroundColor: colors.surfaceSoft }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={alt}
        testID="ai-image-picture"
      >
        {source && loadFailures < 2 ? (
          <ZoomView resetKey={render.id} style={StyleSheet.absoluteFill}>
            <Image
              // Keyed by the image, not its address: the address is signed afresh on every read.
              source={{ ...source, cacheKey: `render-${render.id}` }}
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
          </ZoomView>
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
            />
          </View>
        )}
      </View>

      {denied ? (
        <Banner tone="warning" message={t("aiImage.savePermission")} testID="ai-save-denied">
          <Button variant="ghost" block={false} label={t("aiImage.openSettings")} onPress={openPhotoSettings} />
        </Banner>
      ) : null}

      <View style={{ gap: space.xs }}>
        <Button label={t("aiImage.send")} icon="send" onPress={send} loading={sending.busy} testID="ai-send" />
        <Text variant="small" tone="mute" align="center">
          {t("aiImage.sendHint")}
        </Text>
        <Button variant="secondary" label={t("aiImage.save")} icon="download" onPress={save} loading={saving.busy} testID="ai-save" />
      </View>

      <ListGroup>
        <ListRow icon="file-text" title={t("aiImage.pdf")} onPress={pdf} testID="ai-pdf" />
        <ListRow icon="image" title={t("aiImage.another")} onPress={another} testID="ai-another" />
        <ListRow icon="grid" title={t("aiImage.allImages")} onPress={toImages} />
      </ListGroup>

      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="mute">
          {t("aiImage.shadesTitle")}
        </Text>
        {combo ? (
          <ComboCard combo={combo} />
        ) : !render.comboId ? (
          <Text variant="small" tone="soft">
            {t("aiImage.shadesGone")}
          </Text>
        ) : null}
      </View>

      <Disclaimer kind="ai" />
      <Disclaimer kind="shades" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  frame: { width: "100%", overflow: "hidden" },
});
