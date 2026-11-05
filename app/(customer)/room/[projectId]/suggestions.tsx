import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ShadeBookPage } from "@/api/types";
import { BackButton, Banner, Button, Card, Chip, Disclaimer, ErrorState, Skeleton, Text, useToast } from "@/components/ui";
import { useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { useShadeBook } from "@/features/shade-book/use-shade-book";
import { applyColours, pushRecent, type WallColour } from "@/features/studio/paint-store";
import { pageColours, scopeOf } from "@/features/studio/suggested-swatches";
import { useRoom, wallsWithMasks } from "@/features/studio/use-room";
import { planWalls, wallLabel } from "@/features/studio/wall-plan";
import { plural, t } from "@/i18n";
import { hairline, useTheme } from "@/theme";

/** Combinations shown at a time; "Show more" adds the next ones. */
const STEP = 12;

/**
 * C13 · From the Shade Book. Spec: docs/04-screens-customer.md — C13.
 *
 * The Shade Book's combinations, offered on this room — the same ones the book shows painted
 * on its houses (website shade-grid.tsx, ShadeBookPanel). Interior or exterior, opening on the
 * room's own kind, and two colours or three. Try this puts a combination's colours on the walls
 * being painted in order — the main walls first, as the page lists its parts — and saves.
 *
 * What is shown is what the server sent this account: every page with the pass, the free
 * samples without it, and a line pointing at the book for the rest.
 */
export default function Suggestions() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { colors, radius, space } = useTheme();
  const { projectId = "" } = useLocalSearchParams<{ projectId: string }>();
  const room = useRoom(projectId);
  const catalogue = useCatalogue();
  const scheme = useShadeScheme();
  const book = useShadeBook();

  const roomScope = scopeOf(room.data?.imageType);
  // The room's own kind until the customer picks the other.
  const [picked, setScope] = useState<"INTERIOR" | "EXTERIOR" | null>(null);
  const scope = picked ?? roomScope;
  const [colours, setColours] = useState<0 | 2 | 3>(0);
  // How many are shown, for the filter it was counted under: a new filter starts again at STEP.
  const filterKey = `${scope}|${colours}`;
  const [more, setMore] = useState({ key: filterKey, n: STEP });
  const shown = more.key === filterKey ? more.n : STEP;

  const walls = room.data ? planWalls(wallsWithMasks(room.data)) : [];
  const closed = Boolean(room.data && (room.data.readOnly || room.data.closedAt));

  const pages = useMemo(
    () => (book.data?.combinations ?? []).filter((p) => p.scope === scope && (colours === 0 || p.colours === colours)),
    [book.data, scope, colours],
  );
  const hidden = book.data && !book.data.access.open ? Math.max(0, book.data.total - book.data.combinations.length) : 0;

  const apply = (page: ShadeBookPage) => {
    const changes: Record<string, WallColour> = {};
    pageColours(page, catalogue.data?.shades, scheme).forEach((colour, i) => {
      const wall = walls[i];
      if (!wall) return;
      changes[String(wall.id)] = { hex: colour.hex, code: colour.code, lrv: colour.lrv };
      if (colour.code) pushRecent({ hex: colour.hex, code: colour.code, lrv: colour.lrv, brandSlug: colour.brandSlug });
    });
    if (Object.keys(changes).length === 0) return;
    applyColours(projectId, changes);
    toast.show(t("suggest.applied"), "success");
    if (router.canGoBack()) router.back();
  };

  let body;
  if (closed) {
    body = <Banner tone="info" message={t("suggest.closed")} />;
  } else if (book.isPending) {
    body = (
      <View style={{ gap: space.md }} testID="suggest-loading">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={150} radius={radius.md} />
        ))}
      </View>
    );
  } else if (book.isError) {
    body = <ErrorState error={book.error} onRetry={() => void book.refetch()} />;
  } else if (pages.length === 0) {
    body = (
      <Text variant="body" tone="soft">
        {t("suggest.none")}
      </Text>
    );
  } else {
    body = pages.slice(0, shown).map((page, i) => {
      const set = pageColours(page, catalogue.data?.shades, scheme);
      return (
        <Card key={page.id} testID="shade-book-combo">
          <Text variant="title3">{page.title}</Text>
          <View style={[styles.row, { gap: space.xs }]}>
            {set.map((c, slot) => {
              const wall = walls[slot];
              const where = wall ? wallLabel(wall) : page.shades[slot]?.surfaceLabel ?? "";
              return (
                <View key={slot} style={[styles.slot, { gap: 4, opacity: wall ? 1 : 0.45 }]}>
                  <View style={[styles.chip, { backgroundColor: c.hex, borderColor: colors.rule, borderRadius: radius.sm }]} />
                  <Text variant="caption" tone="mute" numberOfLines={1}>
                    {where}
                  </Text>
                  <Text variant="small" numberOfLines={1}>
                    {c.code ?? c.hex}
                  </Text>
                </View>
              );
            })}
          </View>
          <Button label={t("suggest.tryThis")} onPress={() => apply(page)} disabled={walls.length === 0} testID={`try-${i}`} />
        </Card>
      );
    });
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
        <BackButton fallback="/studio" />
        <View style={{ gap: space.xs }}>
          <Text variant="title1" accessibilityRole="header">
            {t("suggest.title")}
          </Text>
          <Text variant="lead">{t("suggest.lead")}</Text>
        </View>

        {!closed ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
            <Chip label={t("suggest.interior")} selected={scope === "INTERIOR"} onPress={() => setScope("INTERIOR")} />
            <Chip label={t("suggest.exterior")} selected={scope === "EXTERIOR"} onPress={() => setScope("EXTERIOR")} />
            {([0, 2, 3] as const).map((n) => (
              <Chip
                key={n}
                label={n === 0 ? t("suggest.anyColours") : t("suggest.nColours", { n })}
                selected={colours === n}
                onPress={() => setColours(n)}
              />
            ))}
          </ScrollView>
        ) : null}

        {body}

        {!closed && pages.length > shown ? (
          <Button variant="secondary" label={t("suggest.showMore")} onPress={() => setMore({ key: filterKey, n: shown + STEP })} />
        ) : null}

        {!closed && hidden > 0 ? (
          <View style={{ gap: space.xs }}>
            <Text variant="small" tone="mute">
              {plural(hidden, "suggest.moreOne", "suggest.moreN")}
            </Text>
            <Button variant="ghost" label={t("suggest.openBook")} onPress={() => router.push("/shade-book")} testID="open-shade-book" />
          </View>
        ) : null}
        <Disclaimer kind="shades" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: "row" },
  slot: { flex: 1 },
  chip: { height: 56, borderWidth: hairline },
});
