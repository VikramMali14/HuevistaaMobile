import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { shadesApi } from "@/api/endpoints/shades";
import { keys } from "@/api/query-keys";
import {
  BackButton,
  Button,
  Disclaimer,
  EmptyState,
  ListGroup,
  ListRow,
  ShadeCode,
  Sheet,
  Skeleton,
  Text,
} from "@/components/ui";
import { toneOf } from "@/features/catalogue/filter";
import { brandShown, shownName, useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { byRecentActivity, roomChip } from "@/features/rooms/room-status";
import { useProjects } from "@/features/rooms/use-rooms";
import { t, type MessageKey } from "@/i18n";
import { parentFamilyOf } from "@/lib/colour-families";
import { displayCodeOf } from "@/lib/shade-codes";
import { mapToPaintShade } from "@/lib/shade-mapping";
import type { PaintShade } from "@/lib/shade-types";
import { barStyleOn } from "@/lib/status-bar";
import { useTheme } from "@/theme";

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** "Yellows & golds · Lemon Yellows" — the company's own family once, never "Blues · Blues". */
function familyLabel(parent: string, own: string): string {
  if (parent === "Other") return own;
  const label = t(`families.${parent}` as MessageKey);
  return label.toLowerCase() === own.trim().toLowerCase() ? label : `${label} · ${own}`;
}

/**
 * C19 · Shade detail. Spec: docs/04-screens-customer.md — C19.
 *
 * The colour, large; the code to read out at the counter (press and hold to copy);
 * what kind of colour it is; and the two things to do with it. The company is printed
 * only when this viewer may see it — never for a customer (lib/shade-codes.ts).
 */
export default function ShadeDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, space, radius } = useTheme();
  const appScheme = useColorScheme();
  const params = useLocalSearchParams<{ brand: string; code: string }>();
  // Slugs are lower case; a link typed or shared by hand may not be.
  const brand = (params.brand ?? "").toLowerCase();
  const code = (params.code ?? "").toUpperCase();
  const catalogue = useCatalogue();
  const scheme = useShadeScheme();
  const projects = useProjects();
  const [choosing, setChoosing] = useState(false);

  const fromCatalogue = useMemo(
    () =>
      catalogue.data?.shades.find(
        (s) =>
          (s.brandSlug === brand || slugify(s.brand) === brand) &&
          ((s.hvCode ?? "").toUpperCase() === code || s.code.toUpperCase() === code),
      ) ?? null,
    [catalogue.data, brand, code],
  );
  const detail = useQuery({
    queryKey: keys.shadeDetail(brand, code),
    queryFn: () => shadesApi.detail(brand, code),
    enabled: Boolean(brand && code),
    staleTime: 60 * 60_000,
  });

  // The catalogue is the list of what this account may see (a shop customer: their shop's
  // companies). Once it is here, a shade that is not in it is not shown — the public
  // detail is only the stand-in for a catalogue that could not be loaded at all.
  const shade: PaintShade | null =
    fromCatalogue ??
    (!catalogue.data && detail.data ? mapToPaintShade({ ...detail.data, name: detail.data.name ?? undefined }) : null);

  // The colour runs up under the clock: its text has to read on the colour, and go back
  // to the app's own once this screen is left.
  const hex = shade?.hex;
  useFocusEffect(
    useCallback(() => {
      if (!hex) return undefined;
      setStatusBarStyle(barStyleOn(hex));
      return () => setStatusBarStyle(appScheme === "dark" ? "light" : "dark");
    }, [hex, appScheme]),
  );

  if (!shade) {
    // The copy on the phone may be older than this shade: wait for the live list.
    const stillLooking = catalogue.loading || catalogue.refreshing || (!catalogue.data && detail.isPending);
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingTop: insets.top, paddingHorizontal: space.gutter }]}>
        <BackButton fallback="/catalogue" />
        {stillLooking ? (
          <View style={{ gap: space.md, marginTop: space.md }} testID="shade-loading">
            <Skeleton height={220} radius={radius.lg} />
            <Skeleton width={160} height={34} />
            <Skeleton width={220} height={18} />
          </View>
        ) : (
          <EmptyState
            icon="droplet"
            title={t("shade.notFound")}
            body={t("shade.notFoundBody")}
            actionLabel={t("shade.toCatalogue")}
            onAction={() => router.replace("/catalogue")}
          />
        )}
      </View>
    );
  }

  const shownCode = displayCodeOf(scheme, shade);
  const name = shownName(scheme, shade);
  const parent = parentFamilyOf(shade.family);
  const tone = toneOf(shade.lrv);
  const rooms = detail.data?.suitableRooms?.filter(Boolean) ?? [];
  // Only rooms whose walls are marked can take a colour now; the rest are still being
  // read, waiting for walls, failed or closed.
  const readyRooms = (projects.data ?? []).filter((p) => roomChip(p) === "ready").sort(byRecentActivity);
  const shadeParams = { shade: shownCode, brand: shade.brandSlug ?? brand };

  const tryOnRoom = () => {
    if (readyRooms.length === 0) router.push({ pathname: "/room/new", params: shadeParams });
    else setChoosing(true);
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}>
        <View
          style={[styles.colour, { backgroundColor: shade.hex, paddingTop: insets.top }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t("catalogue.shadeLabel", { code: shownCode })}
        >
          <View style={{ paddingHorizontal: space.gutter }}>
            <View style={[styles.backPill, { backgroundColor: `${colors.bg}d9` }]}>
              <BackButton fallback="/catalogue" />
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: space.gutter, gap: space.lg, marginTop: space.lg }}>
          <View style={{ gap: space.xs }}>
            {name ? (
              <Text variant="title1" accessibilityRole="header">
                {name}
              </Text>
            ) : null}
            <ShadeCode code={shownCode} />
            <Text variant="small" tone="mute">
              {t("shade.atCounter")} {t("shade.copyHint")}.
            </Text>
          </View>

          <ListGroup>
            {brandShown(scheme) ? <ListRow title={t("shade.company")} value={shade.brand} /> : null}
            <ListRow
              title={t("shade.family")}
              value={familyLabel(parent, shade.family)}
            />
            <ListRow title={t("shade.depth")} value={`${t(`tones.${tone}` as MessageKey)} · ${t("shade.lrv", { n: shade.lrv })}`} />
            {shade.finishes.length ? <ListRow title={t("shade.finishes")} value={shade.finishes.join(", ")} /> : null}
            {rooms.length ? <ListRow title={t("shade.rooms")} value={rooms.join(", ")} /> : null}
          </ListGroup>

          {detail.data?.aiDescription ? (
            <Text variant="body" tone="soft">
              {detail.data.aiDescription}
            </Text>
          ) : null}

          <View style={{ gap: space.xs }}>
            <Button label={t("shade.tryOnRoom")} icon="image" onPress={tryOnRoom} />
            <Button
              variant="secondary"
              label={t("shade.findShop")}
              icon="map-pin"
              onPress={() => router.push({ pathname: "/nearby", params: { tab: "shops" } })}
            />
          </View>

          <Disclaimer kind="shades" />
        </View>
      </ScrollView>

      <Sheet visible={choosing} onClose={() => setChoosing(false)} title={t("shade.chooseRoom")}>
        <Text variant="body" tone="soft">
          {t("shade.chooseRoomLead")}
        </Text>
        <ListGroup>
          {readyRooms.slice(0, 8).map((room) => (
            <ListRow
              key={room.id}
              icon="image"
              title={room.name?.trim() || t("rooms.untitled")}
              onPress={() => {
                setChoosing(false);
                router.push({ pathname: "/room/[projectId]/paint", params: { projectId: room.id, ...shadeParams } } as Href);
              }}
            />
          ))}
        </ListGroup>
        <Button
          variant="secondary"
          label={t("shade.newRoom")}
          onPress={() => {
            setChoosing(false);
            router.push({ pathname: "/room/new", params: shadeParams });
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  colour: { height: 280, justifyContent: "flex-start" },
  backPill: { alignSelf: "flex-start", borderRadius: 999, paddingLeft: 12, marginTop: 8 },
});
