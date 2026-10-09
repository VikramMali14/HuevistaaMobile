import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { meApi } from "@/api/endpoints/me";
import { keys } from "@/api/query-keys";
import { Button, Chip, ErrorState, Skeleton, Text, TextField } from "@/components/ui";
import { NO_FILTER, TONES, familiesPresent, filterShades, gridItems, type CatalogueFilter, type GridItem } from "@/features/catalogue/filter";
import { namesShown, shownName, useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { applyColours, pushRecent, selectWall, useRecentShades, useRoomPaint, type WallColour } from "@/features/studio/paint-store";
import { shadeColour } from "@/features/studio/shade-colour";
import { useRoom } from "@/features/studio/use-room";
import { wallLabel } from "@/features/studio/wall-plan";
import { t, type MessageKey } from "@/i18n";
import { displayCodeOf } from "@/lib/shade-codes";
import type { PaintShade } from "@/lib/shade-types";
import { hairline, useTheme } from "@/theme";

const COLUMNS = 4;

/**
 * C12 · Shade picker. Spec: docs/04-screens-customer.md — C12.
 *
 * A half-height sheet over the room (it can be pulled up to browse): Recent, the shop's
 * picks, then the catalogue with C3's search, family and depth filters. A tap paints the
 * wall at once — the room above shows it — and the sheet stays open to try another.
 */
export default function ShadePicker() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors, radius, space } = useTheme();
  const params = useLocalSearchParams<{ projectId: string; regionId: string }>();
  const projectId = params.projectId ?? "";
  const regionId = params.regionId ?? "";
  const room = useRoom(projectId);
  const paint = useRoomPaint(projectId);
  const recent = useRecentShades();
  const catalogue = useCatalogue();
  const scheme = useShadeScheme();
  const combos = useQuery({ queryKey: keys.shopCombos, queryFn: meApi.shopCombos, staleTime: 10 * 60_000 });
  const [filter, setFilter] = useState<CatalogueFilter>(NO_FILTER);
  const query = useDeferredValue(filter.query);

  const wall = room.data?.regions.find((r) => String(r.id) === regionId);
  const current = paint.colours[regionId] ?? null;
  const shades = catalogue.data?.shades;
  const families = useMemo(() => familiesPresent(shades ?? []), [shades]);
  const shown = useMemo(
    () => filterShades(shades ?? [], { ...filter, query }, { hideCodes: !scheme.showRealCodes, hideNames: !namesShown(scheme) }),
    [shades, filter, query, scheme],
  );
  const items = useMemo(() => gridItems(shown, COLUMNS), [shown]);
  const picks = useMemo(() => {
    const seen = new Set<string>();
    return (combos.data ?? []).flatMap((c) => c.shades).filter((s) => s.hex && !seen.has(s.code) && seen.add(s.code));
  }, [combos.data]);

  const gap = space.xs;
  const tile = Math.floor((Math.min(width, 640) - space.gutter * 2 - gap * (COLUMNS - 1)) / COLUMNS);
  const set = (patch: Partial<CatalogueFilter>) => setFilter((f) => ({ ...f, ...patch }));

  const put = useCallback(
    (colour: WallColour, brandSlug?: string | null) => {
      if (!projectId || !regionId) return;
      selectWall(projectId, regionId);
      applyColours(projectId, { [regionId]: colour });
      if (colour.code) pushRecent({ hex: colour.hex, code: colour.code, lrv: colour.lrv, brandSlug });
    },
    [projectId, regionId],
  );

  const isCurrent = (hex: string, code: string | null) =>
    Boolean(current && current.hex.toLowerCase() === hex.toLowerCase() && (current.code ?? null) === code);

  const swatch = (key: string, hex: string, code: string | null, label: string, onPress: () => void, size = 44) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isCurrent(hex, code) }}
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: hex, borderWidth: isCurrent(hex, code) ? 3 : hairline },
        { borderColor: isCurrent(hex, code) ? colors.fg : colors.ruleStrong },
      ]}
    />
  );

  const renderItem = useCallback(
    ({ item }: { item: GridItem }) => {
      if (item.kind === "header") {
        return (
          <Text variant="label" tone="mute" style={{ paddingTop: space.md, paddingBottom: space.xs }}>
            {item.brand}
          </Text>
        );
      }
      return (
        <View style={[styles.row, { gap, marginBottom: space.sm }]}>
          {item.shades.map((s: PaintShade) => {
            const code = displayCodeOf(scheme, s);
            const name = shownName(scheme, s);
            const on = isCurrent(s.hex, code);
            return (
              <Pressable
                key={`${s.brand}:${s.code}`}
                onPress={() => put(shadeColour(s, scheme), s.brandSlug)}
                accessibilityRole="button"
                accessibilityLabel={name ? `${name}, ${code}` : code}
                accessibilityState={{ selected: on }}
                style={{ width: tile, gap: 4 }}
                testID="shade-tile"
              >
                <View
                  style={{
                    height: tile * 0.8,
                    borderRadius: radius.sm,
                    backgroundColor: s.hex,
                    borderWidth: on ? 3 : hairline,
                    borderColor: on ? colors.fg : colors.rule,
                  }}
                />
                <Text variant="caption" numberOfLines={1}>
                  {code}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isCurrent reads `current`
    [gap, put, scheme, tile, current, colors, radius.sm, space],
  );

  const chips = (children: ReactNode) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.xs }}>
      {children}
    </ScrollView>
  );

  const header = (
    <View style={{ gap: space.sm, paddingBottom: space.xs }}>
      {recent.length ? (
        <View style={{ gap: space.xs }}>
          <Text variant="label" tone="mute">
            {t("picker.recent")}
          </Text>
          {chips(recent.map((r) => swatch(`r-${r.code}`, r.hex, r.code, `${t("picker.recent")}: ${r.code}`, () => put({ hex: r.hex, code: r.code, lrv: r.lrv }, r.brandSlug))))}
        </View>
      ) : null}
      {picks.length ? (
        <View style={{ gap: space.xs }}>
          <Text variant="label" tone="mute">
            {t("picker.shopPicks")}
          </Text>
          {chips(
            picks.map((p) => {
              const shade = shades?.find((s) => s.code === p.code || s.hvCode === p.code);
              const colour: WallColour = shade ? shadeColour(shade, scheme) : { hex: p.hex, code: p.code, lrv: null };
              return swatch(`p-${p.code}`, colour.hex, colour.code, `${t("picker.shopPicks")}: ${colour.code}`, () => put(colour, shade?.brandSlug));
            }),
          )}
        </View>
      ) : null}
      {families.length > 1
        ? chips(
            <>
              <Chip label={t("families.all")} selected={!filter.family} onPress={() => set({ family: null })} />
              {families.map((f) => (
                <Chip key={f} label={t(`families.${f}` as MessageKey)} selected={filter.family === f} onPress={() => set({ family: filter.family === f ? null : f })} />
              ))}
            </>,
          )
        : null}
      {chips(
        <>
          <Chip label={t("tones.all")} selected={!filter.tone} onPress={() => set({ tone: null })} />
          {TONES.map((tone) => (
            <Chip key={tone} label={t(`tones.${tone}` as MessageKey)} selected={filter.tone === tone} onPress={() => set({ tone: filter.tone === tone ? null : tone })} />
          ))}
        </>,
      )}
    </View>
  );

  let body: ReactNode;
  if (catalogue.loading) {
    body = (
      <View style={[styles.row, { gap, flexWrap: "wrap" }]}>
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} width={tile} height={tile} radius={radius.sm} />
        ))}
      </View>
    );
  } else if (catalogue.error) {
    body = <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />;
  } else {
    body = (
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.kind}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text variant="body" tone="soft" style={{ paddingVertical: space.lg }}>
            {query.trim() ? t("catalogue.noMatch", { query: query.trim() }) : t("catalogue.noMatchFilters")}
          </Text>
        }
        contentContainerStyle={{ paddingBottom: space.lg }}
      />
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.surface, paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: insets.bottom }]}>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Text variant="title3" accessibilityRole="header">
            {t("picker.title")}
          </Text>
          {wall ? (
            <Text variant="small" tone="mute">
              {t("picker.forWall", { wall: wallLabel(wall) })}
            </Text>
          ) : null}
        </View>
        <Button variant="secondary" block={false} label={t("picker.done")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/studio"))} testID="picker-done" />
      </View>
      <TextField
        label={t("catalogue.searchLabel")}
        placeholder={t("catalogue.searchHint")}
        value={filter.query}
        onChangeText={(v) => set({ query: v })}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      <View style={[styles.fill, { marginTop: space.sm }]}>{body}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: "row" },
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
});
