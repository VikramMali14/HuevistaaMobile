import Feather from "@expo/vector-icons/Feather";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { projectsApi } from "@/api/endpoints/projects";
import { isApiError } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { ColourCombo, KeptColours } from "@/api/types";
import { BackButton, Banner, Button, Card, Disclaimer, ErrorState, Skeleton, Text, useToast } from "@/components/ui";
import { namesShown, useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { applyColours, getRoomPaint, pushRecent, type WallColour } from "@/features/studio/paint-store";
import { comboColours, type SuggestedColour } from "@/features/studio/suggested-swatches";
import { useRoom, wallsWithMasks } from "@/features/studio/use-room";
import { planWalls, wallLabel, wallsForTrio } from "@/features/studio/wall-plan";
import { plural, t, type MessageKey } from "@/i18n";
import { hairline, useTheme } from "@/theme";

const ROLES: MessageKey[] = ["suggest.main", "suggest.accent", "suggest.trim"];

/** Nothing kept: one empty place per role — main, accent, trim. */
const NONE_KEPT: readonly (SuggestedColour | null)[] = [null, null, null];

/** What a colour is known by, for telling two apart: its code, or its hex without one. */
const colourKey = (c: SuggestedColour | null | undefined) => (c ? (c.code ?? c.hex).toUpperCase() : "");

/**
 * C13 · Suggested palettes. Spec: docs/04-screens-customer.md — C13.
 *
 * Three named palettes for this room, each colour a real shade, with a sentence on why.
 * Try this puts the main colour on the main wall, the accent on the accent wall and the
 * trim on the trim (website shade-grid.tsx), and saves. Suggest again asks for another
 * set. Free and instant.
 *
 * Keep one, change the rest: each colour has a lock. A customer with three walls who
 * likes one colour locks it, and every palette is then built around it — the kept colour
 * stays on its wall, and Suggest again changes only the others (website shade-grid.tsx,
 * the same padlock).
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
  // The colour kept in each role, or null. A lock is on a ROLE because that is how the
  // palettes come back, and each role has its own wall (below).
  const [kept, setKept] = useState<readonly (SuggestedColour | null)[]>(NONE_KEPT);
  const keeping = kept.some(Boolean);
  const keptBody = (): KeptColours => {
    const one = (c: SuggestedColour | null | undefined) => (c ? { hex: c.hex, code: c.code } : null);
    return { primary: one(kept[0]), accent: one(kept[1]), trim: one(kept[2]) };
  };
  const suggestions = useQuery({
    queryKey: keys.suggestions(projectId, round, keeping ? kept.map(colourKey).join("|") : undefined),
    queryFn: () =>
      keeping ? projectsApi.suggestions(projectId, round, keptBody()) : projectsApi.suggestions(projectId, round),
    enabled: Boolean(projectId),
    staleTime: Infinity,
    // The palettes on screen stay while the next set comes: a lock pressed on one of
    // them must not blank the screen under the finger that pressed it.
    placeholderData: keepPreviousData,
  });

  const walls = room.data ? planWalls(wallsWithMasks(room.data)) : [];
  const targets = wallsForTrio(walls, null);
  // From two walls up: with one, keeping its colour leaves nothing to suggest.
  const canKeep = targets.filter(Boolean).length >= 2;
  const keptWalls = targets.filter((wall, slot) => wall && kept[slot]);
  const allKept = keeping && targets.every((wall, slot) => !wall || kept[slot]);

  // A kept colour goes in its role whatever came back: a server that knows about locks
  // already put it there, and one that does not still shows the colour that was kept.
  const trioOf = (combo: ColourCombo) =>
    comboColours(combo, catalogue.data?.shades, scheme).map((colour, slot) => kept[slot] ?? colour);

  const toggleKeep = (slot: number, colour: SuggestedColour) => {
    setKept((prev) => prev.map((k, i) => (i !== slot ? k : colourKey(k) === colourKey(colour) ? null : colour)));
    // The first set around a new lock is the best answer for it.
    setRound(0);
  };
  const unlockAll = () => {
    setKept(NONE_KEPT);
    setRound(0);
  };

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

        {canKeep && !closed ? (
          keeping ? (
            <View
              testID="suggest-keeping"
              style={[styles.keeping, { gap: space.xxs, padding: space.sm, borderRadius: radius.md, borderColor: colors.accent, backgroundColor: colors.surface }]}
            >
              <View style={[styles.keepingHead, { gap: space.xs }]}>
                <Feather name="lock" size={14} color={colors.accentText} />
                <Text variant="bodyStrong" tone="accent" style={styles.fill}>
                  {plural(keptWalls.length, "suggest.keepingOne", "suggest.keepingN")}
                </Text>
                <Button variant="ghost" block={false} label={t("suggest.unlockAll")} onPress={unlockAll} />
              </View>
              <Text variant="small" tone="soft">
                {allKept
                  ? t("suggest.keepingAll")
                  : t("suggest.keepingHint", { walls: keptWalls.map((w) => wallLabel(w!)).join(", ") })}
              </Text>
            </View>
          ) : (
            <Text variant="small" tone="mute">
              {t("suggest.keepTip")}
            </Text>
          )
        ) : null}

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
                    const wall = targets[slot];
                    const isKept = Boolean(kept[slot]);
                    const where = wall ? wallLabel(wall) : t(ROLES[slot]!);
                    const colour = name || c.code || c.hex;
                    return (
                      <View key={slot} style={[styles.slot, { gap: 4, opacity: wall ? 1 : 0.45 }]}>
                        <View>
                          <View
                            style={[
                              styles.chip,
                              {
                                backgroundColor: c.hex,
                                borderColor: isKept ? colors.accent : colors.rule,
                                borderWidth: isKept ? 2 : hairline,
                                borderRadius: radius.sm,
                              },
                            ]}
                          />
                          {/* Only where the colour has a wall to stay on. */}
                          {canKeep && wall && c.hex ? (
                            <Pressable
                              testID={`keep-${i}-${slot}`}
                              accessibilityRole="button"
                              accessibilityLabel={t(isKept ? "suggest.unkeep" : "suggest.keep", { colour, wall: where })}
                              accessibilityState={{ selected: isKept }}
                              onPress={() => toggleKeep(slot, c)}
                              hitSlop={10}
                              style={[
                                styles.lock,
                                {
                                  backgroundColor: isKept ? colors.accent : `${colors.bg}e6`,
                                  borderColor: isKept ? colors.accent : colors.rule,
                                },
                              ]}
                            >
                              <Feather name={isKept ? "lock" : "unlock"} size={14} color={isKept ? colors.accentOn : colors.fg} />
                            </Pressable>
                          ) : null}
                        </View>
                        <Text variant="caption" tone={isKept ? "accent" : "mute"} numberOfLines={1}>
                          {where}
                        </Text>
                        <Text variant="small" numberOfLines={1}>
                          {colour}
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
          <Button
            variant="secondary"
            label={t("suggest.again")}
            icon="refresh-cw"
            onPress={() => setRound((r) => r + 1)}
            loading={suggestions.isFetching}
            // Every wall kept: there is nothing left for another set to change.
            disabled={allKept}
          />
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
  // A 28 dp disc in the swatch's corner; the hit slop makes it a 48 dp target.
  lock: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  keeping: { borderWidth: hairline },
  keepingHead: { flexDirection: "row", alignItems: "center" },
});
