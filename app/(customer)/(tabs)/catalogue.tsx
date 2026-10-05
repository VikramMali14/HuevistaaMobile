import Feather from "@expo/vector-icons/Feather";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useRouter, type Href } from "expo-router";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import {
  Button,
  Card,
  Chip,
  Disclaimer,
  EmptyState,
  ErrorState,
  Screen,
  Skeleton,
  SwatchTile,
  Text,
  TextField,
} from "@/components/ui";
import {
  NO_FILTER,
  TONES,
  familiesPresent,
  filterShades,
  gridItems,
  type CatalogueFilter,
  type GridItem,
} from "@/features/catalogue/filter";
import { shownName, useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { shadeHref } from "@/features/catalogue/links";
import { useLibrary } from "@/features/library/use-library";
import { t, type MessageKey } from "@/i18n";
import { displayCodeOf } from "@/lib/shade-codes";
import { useTheme } from "@/theme";

const COLUMNS = 3;

/**
 * C3 · Catalogue. Spec: docs/04-screens-customer.md — C3.
 *
 * Every shade this account may see, filtered on the phone: by name or code, by a colour
 * word ("light yellow"), by company, colour family and depth. Grouped by company. Works
 * offline from the copy kept on the phone.
 */
export default function CatalogueScreen() {
  const router = useRouter();
  const { colors, space } = useTheme();
  const { width } = useWindowDimensions();
  const catalogue = useCatalogue();
  const scheme = useShadeScheme();
  const library = useLibrary();

  const [filter, setFilter] = useState<CatalogueFilter>(NO_FILTER);
  const query = useDeferredValue(filter.query);
  const listRef = useRef<FlashListRef<GridItem>>(null);

  // A new search or filter starts at the top, so its first matches (and the filters
  // themselves) are in view rather than wherever the last list was scrolled to.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [query, filter.brand, filter.family, filter.tone]);

  const shades = catalogue.data?.shades;
  const brands = catalogue.data?.brands ?? [];
  const families = useMemo(() => familiesPresent(shades ?? []), [shades]);
  const shown = useMemo(
    () => filterShades(shades ?? [], { ...filter, query }, { hideCodes: !scheme.showRealCodes, hideNames: scheme.showNames === false }),
    [shades, filter, query, scheme.showRealCodes, scheme.showNames],
  );
  const items = useMemo(() => gridItems(shown, COLUMNS), [shown]);

  const gap = space.sm;
  const tile = Math.floor((Math.min(width, 640) - space.gutter * 2 - gap * (COLUMNS - 1)) / COLUMNS);
  const filtered = Boolean(filter.brand || filter.family || filter.tone);
  const set = (patch: Partial<CatalogueFilter>) => setFilter((f) => ({ ...f, ...patch }));

  const renderItem = useCallback(
    ({ item }: { item: GridItem }) => {
      if (item.kind === "header") {
        return (
          <View style={[styles.groupHead, { paddingTop: space.lg, paddingBottom: space.xs }]}>
            <Text variant="label" tone="mute" accessibilityRole="header">
              {item.brand}
            </Text>
            <Text variant="caption" tone="mute">
              {item.count === 1 ? t("catalogue.countOne") : t("catalogue.count", { n: item.count })}
            </Text>
          </View>
        );
      }
      return (
        <View style={[styles.row, { gap, marginBottom: space.md }]}>
          {item.shades.map((s) => {
            const code = displayCodeOf(scheme, s);
            const name = shownName(scheme, s);
            return (
              <SwatchTile
                key={`${s.brand}:${s.code}`}
                hex={s.hex}
                code={code}
                name={name}
                width={tile}
                accessibilityLabel={name ? `${name}, ${t("catalogue.shadeLabel", { code })}` : t("catalogue.shadeLabel", { code })}
                onPress={() => router.push(shadeHref(s) as Href)}
              />
            );
          })}
        </View>
      );
    },
    [gap, router, scheme, space.lg, space.md, space.xs, tile],
  );

  const chipsRow = (children: ReactNode) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.gutter }}
      style={{ marginHorizontal: -space.gutter }}
    >
      {children}
    </ScrollView>
  );

  const header = (
    <View style={{ gap: space.sm, paddingBottom: space.xs }}>
      {library.live ? (
        <Card onPress={() => router.push("/library")} accessibilityLabel={t("catalogue.readyRooms")} style={{ paddingVertical: space.sm }}>
          <View style={styles.inline}>
            <Feather name="image" size={18} color={colors.accentText} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{t("catalogue.readyRooms")}</Text>
              <Text variant="small" tone="mute">
                {t("home.readyRoomsLead")}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.fgMute} />
          </View>
        </Card>
      ) : null}
      {brands.length > 1
        ? chipsRow(
            <>
              <Chip label={t("catalogue.allCompanies")} selected={!filter.brand} onPress={() => set({ brand: null })} />
              {brands.map((b) => (
                <Chip key={b.slug} label={b.name} selected={filter.brand === b.name} onPress={() => set({ brand: b.name })} />
              ))}
            </>,
          )
        : null}
      {families.length > 1
        ? chipsRow(
            <>
              <Chip label={t("families.all")} selected={!filter.family} onPress={() => set({ family: null })} />
              {families.map((f) => (
                <Chip
                  key={f}
                  label={t(`families.${f}` as MessageKey)}
                  selected={filter.family === f}
                  onPress={() => set({ family: filter.family === f ? null : f })}
                />
              ))}
            </>,
          )
        : null}
      {chipsRow(
        <>
          <Chip label={t("tones.all")} selected={!filter.tone} onPress={() => set({ tone: null })} />
          {TONES.map((tone) => (
            <Chip
              key={tone}
              label={t(`tones.${tone}` as MessageKey)}
              selected={filter.tone === tone}
              onPress={() => set({ tone: filter.tone === tone ? null : tone })}
            />
          ))}
        </>,
      )}
      <View style={styles.countRow}>
        <Text variant="small" tone="mute" accessibilityLiveRegion="polite">
          {shown.length === 1 ? t("catalogue.countOne") : t("catalogue.count", { n: shown.length.toLocaleString("en-IN") })}
        </Text>
        {filtered ? (
          <Button variant="ghost" block={false} label={t("catalogue.clearFilters")} onPress={() => setFilter((f) => ({ ...NO_FILTER, query: f.query }))} />
        ) : null}
      </View>
    </View>
  );

  const empty = query.trim() ? (
    <View style={{ gap: space.sm, paddingVertical: space.xl }}>
      <Text variant="body" tone="soft">
        {t("catalogue.noMatch", { query: query.trim() })}
      </Text>
      {filtered ? (
        <Button variant="secondary" block={false} label={t("catalogue.clearFilters")} onPress={() => setFilter((f) => ({ ...NO_FILTER, query: f.query }))} />
      ) : null}
    </View>
  ) : (
    <View style={{ gap: space.sm, paddingVertical: space.xl }}>
      <Text variant="body" tone="soft">
        {t("catalogue.noMatchFilters")}
      </Text>
      <Button variant="secondary" block={false} label={t("catalogue.clearFilters")} onPress={() => setFilter(NO_FILTER)} />
    </View>
  );

  let body: ReactNode;
  if (catalogue.loading) {
    body = (
      <View style={{ paddingHorizontal: space.gutter, gap: space.md, paddingTop: space.md }} testID="catalogue-loading">
        {[0, 1, 2, 3].map((r) => (
          <View key={r} style={[styles.row, { gap }]}>
            {[0, 1, 2].map((c) => (
              <Skeleton key={c} width={tile} height={tile + 22} radius={10} />
            ))}
          </View>
        ))}
      </View>
    );
  } else if (catalogue.error) {
    body = <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />;
  } else if (!shades?.length) {
    body = <EmptyState icon="droplet" title={t("catalogue.empty")} body={t("catalogue.emptyBody")} actionLabel={t("account.addCode")} onAction={() => router.push("/add-shop-code")} />;
  } else {
    body = (
      <FlashList
        ref={listRef}
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.kind}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xl }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <View style={{ paddingTop: space.md }}>
            <Disclaimer kind="shades" />
          </View>
        }
        onRefresh={() => void catalogue.refetch()}
        refreshing={catalogue.refreshing}
      />
    );
  }

  return (
    <Screen edges={["top"]} padded={false}>
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm }}>
        <Text variant="title1" accessibilityRole="header">
          {t("catalogue.title")}
        </Text>
        <TextField
          label={t("catalogue.searchLabel")}
          placeholder={t("catalogue.searchHint")}
          value={filter.query}
          onChangeText={(next) => set({ query: next })}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          editable={Boolean(shades?.length)}
        />
      </View>
      <View style={styles.fill}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: "row" },
  inline: { flexDirection: "row", alignItems: "center", gap: 10 },
  groupHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  countRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 },
});
