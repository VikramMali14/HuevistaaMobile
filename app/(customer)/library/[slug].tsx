import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { libraryApi } from "@/api/endpoints/library";
import { isApiError, messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import {
  BackButton,
  Banner,
  Button,
  Disclaimer,
  EmptyState,
  RemoteImage,
  Screen,
  Skeleton,
  Text,
} from "@/components/ui";
import { useLibrary } from "@/features/library/use-library";
import { byRecentActivity, isInProgress } from "@/features/rooms/room-status";
import { useProjects } from "@/features/rooms/use-rooms";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { hairline, useTheme } from "@/theme";

/**
 * C21 · Ready-made room. Spec: docs/04-screens-customer.md — C21.
 *
 * One published room, and **Paint this room**: the caller gets their own copy with the
 * walls already marked, so it opens straight on the paint step. Free — the backend spends
 * no room, credit or points on it.
 */
export default function LibraryRoom() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, space, radius } = useTheme();
  const viewport = useWindowDimensions();
  const { slug = "" } = useLocalSearchParams<{ slug: string }>();
  const library = useLibrary();
  const listed = library.rooms.find((r) => r.slug === slug);
  const fetched = useQuery({
    queryKey: keys.libraryRoom(slug),
    queryFn: () => libraryApi.get(slug),
    // Asked for only once the list has answered without it (a link from outside the list).
    enabled: Boolean(slug) && !listed && !library.isPending,
  });
  const room = listed ?? fetched.data;
  const projects = useProjects();
  const starting = useSubmit();
  const [error, setError] = useState<string | null>(null);

  const paint = () =>
    void starting.run(async () => {
      setError(null);
      try {
        const started = await libraryApi.start(slug);
        void queryClient.invalidateQueries({ queryKey: keys.projects });
        router.replace({ pathname: "/room/[projectId]/paint", params: { projectId: started.projectId } } as Href);
      } catch (err) {
        setError(messageFor(err));
      }
    });

  if (!room) {
    const gone = fetched.isError && isApiError(fetched.error) && fetched.error.status === 404;
    return (
      <Screen scroll>
        <BackButton fallback="/library" />
        {library.isPending || fetched.isPending ? (
          <View style={{ gap: space.md, marginTop: space.md }} testID="library-room-loading">
            <Skeleton height={260} radius={radius.lg} />
            <Skeleton width={200} height={28} />
          </View>
        ) : (
          <EmptyState
            icon="image"
            title={gone ? t("library.notFound") : t("errors.generic")}
            body={gone ? t("library.notFoundBody") : messageFor(fetched.error)}
            actionLabel={gone ? t("library.seeOthers") : t("common.retry")}
            onAction={() => (gone ? router.replace("/library") : void fetched.refetch())}
          />
        )}
      </Screen>
    );
  }

  // Every "Paint this room" makes a new copy (the backend does not reuse one), so a
  // second visit offers the copy already being painted first. A copy carries the room's
  // title as its name until its owner renames it.
  const copy = (projects.data ?? [])
    .filter((p) => p.fromLibrary && isInProgress(p) && p.name === room.title)
    .sort(byRecentActivity)[0];

  const ratio = room.imageWidth && room.imageHeight ? room.imageWidth / room.imageHeight : 4 / 3;
  // A tall photo is cropped to half the screen, so the room's name and colours start
  // above the buttons instead of under them.
  const photoHeight = Math.min(viewport.width / Math.max(0.6, Math.min(ratio, 1.8)), viewport.height * 0.5);
  const colours = (room.colours ?? []).filter((c) => c?.hex);

  return (
    <Screen
      padded={false}
      footer={
        copy ? (
          <View style={{ gap: space.xs }}>
            <Text variant="small" tone="mute" align="center">
              {t("library.haveCopy")}
            </Text>
            <Button
              label={t("library.openCopy")}
              icon="droplet"
              onPress={() => router.push({ pathname: "/room/[projectId]", params: { projectId: copy.id } } as Href)}
              disabled={starting.busy}
              testID="library-open-copy"
            />
            <Button variant="ghost" label={t("library.freshCopy")} onPress={paint} loading={starting.busy} testID="library-fresh" />
          </View>
        ) : (
          <View style={{ gap: space.xs }}>
            <Button label={t("library.paint")} icon="droplet" onPress={paint} loading={starting.busy} testID="library-paint" />
            <Text variant="small" tone="mute" align="center">
              {t("library.free")}
            </Text>
          </View>
        )
      }
    >
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        <View style={{ paddingHorizontal: space.gutter }}>
          <BackButton fallback="/library" />
        </View>
        <RemoteImage url={room.imageUrl} style={{ width: "100%", height: photoHeight }} accessibilityLabel={room.title} />
        <View style={{ paddingHorizontal: space.gutter, gap: space.md, marginTop: space.lg }}>
          <View style={{ gap: space.xxs }}>
            {room.roomLabel ? (
              <Text variant="label" tone="mute">
                {room.roomLabel}
              </Text>
            ) : null}
            <Text variant="title1" accessibilityRole="header">
              {room.title}
            </Text>
          </View>
          {room.description ? <Text variant="body" tone="soft">{room.description}</Text> : null}
          {colours.length ? (
            <View style={{ gap: space.sm }}>
              <Text variant="label" tone="mute">
                {t("library.colours")}
              </Text>
              {colours.map((c, i) => (
                <View key={`${c.hex}${i}`} style={styles.colour}>
                  <View style={[styles.swatch, { backgroundColor: c.hex, borderColor: colors.ruleStrong, borderRadius: radius.xs }]} />
                  <Text variant="body" style={{ flex: 1 }}>
                    {c.label || "—"}
                  </Text>
                  {c.shadeCode ? <Text variant="code">{c.shadeCode}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
          {error ? <Banner tone="danger" message={error} /> : null}
          {colours.length ? <Disclaimer kind="shades" /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  colour: { flexDirection: "row", alignItems: "center", gap: 12 },
  swatch: { width: 28, height: 28, borderWidth: hairline },
});
