import Feather from "@expo/vector-icons/Feather";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import type { ShadeBookPage } from "@/api/types";
import { Button, Card, Disclaimer, EmptyState, ErrorState, Screen, Skeleton, Text, TextField } from "@/components/ui";
import {
  NO_FILTER,
  bookHouses,
  familyCounts,
  gridPages,
  gridParams,
  housesWhere,
  lockedFor,
  ownHouse,
  type ShadeBookFilter,
} from "@/features/shade-book/book";
import { CatalogueSwitch } from "@/features/shade-book/CatalogueSwitch";
import { BuyButton, Filters, HouseChooser, PageCard, PassNoticeBanner, Standing } from "@/features/shade-book/components";
import { useShadeBook } from "@/features/shade-book/use-shade-book";
import { t } from "@/i18n";
import { usePassPurchase } from "@/features/payments/use-pass-purchase";
import { shadeBookPass } from "@/features/shade-book/pass";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

/** The pictures' frame while they are on houses of different shapes: each sits in it whole. */
const MIXED_FRAME = 4 / 3;

/**
 * C34 · Shade Book. Spec: docs/04-screens-customer.md — C34. In the Catalogue tab, beside the
 * shades: the switch at the top of both screens, and the tab stays lit.
 *
 * What to look at — exterior or interior, two colours or three, the colour families a
 * combination must have — and which house to see them on, then every combination that fits in a
 * grid of pictures, two a row: each on its own house, or all on the one house chosen — the same
 * photo again and again, a combination painted on each (the server paints them, as it does for
 * the website and the picture saved), its Vista codes under it. Pressing one opens it large
 * (C37). The first few of each kind and number of colours are free; the 24-hour pass opens the
 * rest and lets each picture be saved with its codes. What is open is the server's answer — this
 * screen only shows it.
 */
export default function ShadeBookScreen() {
  const router = useRouter();
  const { colors, space } = useTheme();
  const screen = useWindowDimensions();
  const book = useShadeBook();
  const pass = usePassPurchase(book.data?.access, shadeBookPass);
  const pull = usePullToRefresh(book.refetch);
  const listRef = useRef<FlashListRef<ShadeBookPage>>(null);
  const [filter, setFilter] = useState<ShadeBookFilter>(NO_FILTER);
  const [houseId, setHouseId] = useState<string | null>(null);

  const data = book.data;
  const houses = useMemo(() => (data ? bookHouses(data) : []), [data]);
  const offered = useMemo(() => housesWhere(houses, filter), [houses, filter]);
  // The house chosen while the filter keeps it; otherwise each combination on its own.
  const { house, pages } = useMemo(() => (data ? gridPages(data, filter, houseId) : { house: null, pages: [] }), [data, filter, houseId]);
  const counts = useMemo(() => (data ? familyCounts(data, filter) : {}), [data, filter]);
  const open = Boolean(data?.access.open);
  const filtered = filter.kind !== "ALL" || filter.colours !== 0 || filter.families.length > 0;
  const onHouse = useCallback((page: ShadeBookPage) => house ?? ownHouse(page, houses), [house, houses]);
  // Every picture on one house: the photo's own shape. Otherwise a frame each house sits in whole.
  const frame = useMemo(() => {
    const first = pages[0] ? onHouse(pages[0]) : undefined;
    const one = first && pages.every((p) => onHouse(p)?.id === first.id) ? first : undefined;
    return one ? one.width / one.height : MIXED_FRAME;
  }, [pages, onHouse]);
  const columns = screen.width >= 700 ? 3 : 2;
  const gap = space.sm;

  // A new filter or house reads the grid from the top.
  const narrow = (next: ShadeBookFilter) => {
    setFilter(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const chooseHouse = (id: string | null) => {
    setHouseId(id);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  // The picture opened carries the grid with it, so Previous and Next step through the same ones.
  const openPage = useCallback(
    (page: ShadeBookPage) => router.push({ pathname: "/shade-book/[id]", params: { id: page.id, ...gridParams(filter, house?.id ?? null) } }),
    [filter, house?.id, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ShadeBookPage }) => (
      <View style={{ paddingHorizontal: gap / 2, paddingBottom: gap }}>
        <PageCard page={item} house={onHouse(item)} frame={frame} free={item.sample && !open} onPress={() => openPage(item)} />
      </View>
    ),
    [gap, onHouse, frame, open, openPage],
  );

  let body: ReactNode;
  if (book.isPending) {
    body = (
      <View style={{ paddingHorizontal: space.gutter, gap: space.md, paddingTop: space.sm }} testID="shade-book-loading">
        <Skeleton width="100%" height={64} radius={10} />
        <View style={[styles.inline, { gap }]}>
          <Skeleton width="48%" height={190} radius={12} />
          <Skeleton width="48%" height={190} radius={12} />
        </View>
      </View>
    );
  } else if (book.error || !data) {
    body = <ErrorState error={book.error} onRetry={() => void book.refetch()} />;
  } else if (data.total === 0 || houses.length === 0) {
    body = <EmptyState icon="book-open" title={t("shadeBook.empty")} body={t("shadeBook.emptyBody")} />;
  } else {
    // On a house chosen, those that would fit it: as many colours as it has parts.
    const locked = lockedFor(data, house ? { ...filter, colours: house.surfaces.length as ShadeBookFilter["colours"] } : filter);
    const query = filter.query.trim();
    const header = (
      <View style={{ gap: space.md, paddingTop: space.sm, paddingBottom: space.md, paddingHorizontal: gap / 2 }}>
        <Standing book={data} price={pass.price} sellable={pass.sellable} busy={pass.busy} onBuy={() => void pass.buy()} />
        <PassNoticeBanner notice={pass.notice} />
        <Filters filter={filter} counts={counts} onChange={narrow} />
        {offered.length > 0 ? <HouseChooser houses={offered} chosen={house?.id ?? null} onChoose={chooseHouse} /> : null}
        <TextField
          label={t("shadeBook.searchLabel")}
          placeholder={t("shadeBook.searchHint")}
          value={filter.query}
          onChangeText={(typed) => setFilter((f) => ({ ...f, query: typed }))}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <Text variant="caption" tone="mute" accessibilityLiveRegion="polite" testID="shade-book-count">
          {query
            ? t("shadeBook.found", { n: pages.length })
            : locked > 0
              ? t("shadeBook.countOf", { shown: pages.length, total: pages.length + locked })
              : t("shadeBook.countAll", { n: pages.length })}
        </Text>
      </View>
    );
    const footer = (
      <View style={{ gap: space.md, paddingTop: space.xs, paddingHorizontal: gap / 2 }}>
        {locked > 0 && !query ? (
          <Card style={{ gap: space.sm }} testID="shade-book-locked">
            <View style={[styles.inline, { gap: 10 }]}>
              <Feather name="lock" size={18} color={colors.fgMute} />
              <Text variant="bodyStrong">
                {filtered || house ? t("shadeBook.lockedLike", { n: locked }) : t("shadeBook.lockedAll", { n: locked })}
              </Text>
            </View>
            <Text variant="small" tone="soft">
              {t("shadeBook.lockedEvery")}
            </Text>
            <BuyButton book={data} price={pass.price} sellable={pass.sellable} busy={pass.busy} onBuy={() => void pass.buy()} />
          </Card>
        ) : null}
        <Disclaimer kind="shades" />
      </View>
    );
    body = (
      <FlashList
        ref={listRef}
        data={pages}
        numColumns={columns}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        extraData={[house?.id, frame, open]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.gutter - gap / 2, paddingBottom: space.xl }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={{ gap: space.sm, paddingVertical: space.lg, paddingHorizontal: gap / 2 }}>
            <Text variant="body" tone="soft">
              {query ? t("shadeBook.noMatch") : locked > 0 ? t("shadeBook.noneFree") : t("shadeBook.noneLike")}
            </Text>
            {query ? (
              <Button variant="secondary" block={false} label={t("shadeBook.showAll")} onPress={() => setFilter((f) => ({ ...f, query: "" }))} />
            ) : (filtered || house) && locked === 0 ? (
              <Button
                variant="secondary"
                block={false}
                label={t("shadeBook.showAll")}
                onPress={() => {
                  narrow({ ...NO_FILTER });
                  setHouseId(null);
                }}
              />
            ) : null}
          </View>
        }
        ListFooterComponent={footer}
        onRefresh={pull.onRefresh}
        refreshing={pull.refreshing}
      />
    );
  }

  return (
    <Screen edges={["top"]} padded={false}>
      <View style={[styles.top, { paddingHorizontal: space.gutter, paddingTop: space.sm, paddingBottom: space.sm, borderBottomColor: colors.rule }]}>
        <CatalogueSwitch value="book" />
      </View>
      <View style={styles.fill}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { borderBottomWidth: StyleSheet.hairlineWidth },
  fill: { flex: 1 },
  inline: { flexDirection: "row", alignItems: "center" },
});
