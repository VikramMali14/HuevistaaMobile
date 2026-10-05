import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { projectsApi } from "@/api/endpoints/projects";
import { isApiError } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { ColourCombo, MatchedShade } from "@/api/types";
import { BackButton, Banner, Button, Card, Disclaimer, ErrorState, Skeleton, Text, useToast } from "@/components/ui";
import { namesShown, useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { applyColours, getRoomPaint, pushRecent, type WallColour } from "@/features/studio/paint-store";
import { shadeColour } from "@/features/studio/shade-colour";
import { useRoom, wallsWithMasks } from "@/features/studio/use-room";
import { planWalls, wallLabel, wallsForTrio } from "@/features/studio/wall-plan";
import { t, type MessageKey } from "@/i18n";
import type { PaintShade } from "@/lib/shade-types";
import { hairline, useTheme } from "@/theme";

const ROLES: MessageKey[] = ["suggest.main", "suggest.accent", "suggest.trim"];

/**
 * C13 · Suggested palettes. Spec: docs/04-screens-customer.md — C13.
 *
 * Three named palettes for this room, each colour a real shade, with a sentence on why.
 * Try this puts the main colour on the main wall, the accent on the accent wall and the
 * trim on the trim (website shade-grid.tsx), and saves. Suggest again asks for another
 * set. Free and instant.
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
  const [round, setRound] = useState(0);
  const suggestions = useQuery({
    queryKey: keys.suggestions(projectId, round),
    queryFn: () => projectsApi.suggestions(projectId, round),
    enabled: Boolean(projectId),
    staleTime: Infinity,
  });

  const walls = room.data ? planWalls(wallsWithMasks(room.data)) : [];

  const colourOf = (matched: MatchedShade | null | undefined, hex: string): WallColour & { brandSlug?: string } => {
    const shade: PaintShade | undefined = matched
      ? catalogue.data?.shades.find((s) => s.code === matched.shadeCode || (matched.hvCode && s.hvCode === matched.hvCode))
      : undefined;
    if (shade) return { ...shadeColour(shade, scheme), brandSlug: shade.brandSlug };
    return { hex: matched?.hexCode ?? hex, code: matched?.hvCode ?? matched?.shadeCode ?? null, lrv: null };
  };

  const trioOf = (combo: ColourCombo) => [
    colourOf(combo.primaryShade, combo.primaryHex),
    colourOf(combo.accentShade, combo.accentHex),
    colourOf(combo.trimShade, combo.trimHex),
  ];

  const apply = (combo: ColourCombo) => {
    const selected = getRoomPaint(projectId).selected;
    const targets = wallsForTrio(walls, selected ? Number(selected) : null);
    const changes: Record<string, WallColour> = {};
    trioOf(combo).forEach((colour, i) => {
      const wall = targets[i];
      if (!wall) return;
      changes[String(wall.id)] = { hex: colour.hex, code: colour.code, lrv: colour.lrv };
      if (colour.code) pushRecent({ hex: colour.hex, code: colour.code, lrv: colour.lrv, brandSlug: colour.brandSlug });
    });
    if (Object.keys(changes).length === 0) return;
    applyColours(projectId, changes);
    toast.show(t("suggest.applied"), "success");
    if (router.canGoBack()) router.back();
  };

  const closed = suggestions.isError && isApiError(suggestions.error) && suggestions.error.status === 402;
  const combos = (suggestions.data?.combinations ?? []).filter((c) => c.primaryHex || c.primaryShade);

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

        {suggestions.isPending ? (
          <View style={{ gap: space.md }} testID="suggest-loading">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={150} radius={radius.md} />
            ))}
          </View>
        ) : closed ? (
          <Banner tone="info" message={t("suggest.closed")} />
        ) : suggestions.isError ? (
          <ErrorState error={suggestions.error} onRetry={() => void suggestions.refetch()} />
        ) : (
          combos.map((combo, i) => {
            const trio = trioOf(combo);
            const targets = wallsForTrio(walls, null);
            return (
              <Card key={`${i}-${combo.name}`}>
                <Text variant="title3">{combo.name}</Text>
                {combo.rationale ? (
                  <Text variant="body" tone="soft">
                    {combo.rationale}
                  </Text>
                ) : null}
                <View style={[styles.trio, { gap: space.xs }]}>
                  {trio.map((c, slot) => {
                    const matched = [combo.primaryShade, combo.accentShade, combo.trimShade][slot];
                    const name = namesShown(scheme) ? matched?.name?.trim() : null;
                    return (
                      <View key={slot} style={[styles.slot, { gap: 4 }]}>
                        <View style={[styles.chip, { backgroundColor: c.hex, borderColor: colors.rule, borderRadius: radius.sm }]} />
                        <Text variant="caption" tone="mute" numberOfLines={1}>
                          {targets[slot] ? wallLabel(targets[slot]) : t(ROLES[slot]!)}
                        </Text>
                        <Text variant="small" numberOfLines={1}>
                          {name || c.code || c.hex}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <Button label={t("suggest.tryThis")} onPress={() => apply(combo)} />
              </Card>
            );
          })
        )}

        {!closed && !suggestions.isPending ? (
          <Button variant="secondary" label={t("suggest.again")} icon="refresh-cw" onPress={() => setRound((r) => r + 1)} loading={suggestions.isFetching} />
        ) : null}
        <Disclaimer kind="shades" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  trio: { flexDirection: "row" },
  slot: { flex: 1 },
  chip: { height: 56, borderWidth: hairline },
});
