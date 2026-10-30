import Feather from "@expo/vector-icons/Feather";
import { FlashList } from "@shopify/flash-list";
import { useRouter, type Href } from "expo-router";
import { useCallback, useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import type { ShadeBookPage } from "@/api/types";
import { Button, Card, Chip, Disclaimer, EmptyState, ErrorState, Screen, Skeleton, Text, TextField } from "@/components/ui";
import { NO_FILTER, colourCounts, filterShadeBook, lockedPages, type ShadeBookFilter } from "@/features/shade-book/book";
import { CatalogueSwitch } from "@/features/shade-book/CatalogueSwitch";
import { BuyButton, PageCard, PassNoticeBanner, Standing } from "@/features/shade-book/components";
import { usePassPurchase } from "@/features/shade-book/use-pass-purchase";
import { useShadeBook } from "@/features/shade-book/use-shade-book";
import { t } from "@/i18n";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

/**
 * C34 · Shade Book. Spec: docs/04-screens-customer.md — C34. In the Catalogue tab, beside the
 * shades: the switch at the top of both screens, and the tab stays lit.
 *
 * Colour combinations of our shades, each painted on a real house by the server, with every
 * part's Vista code. The first few are free; the 24-hour pass opens the rest and lets each
 * picture be saved with its codes (C35). What is open is the server's answer — this screen
 * only shows it, and reads it again after a purchase and when the pass ends.
 */
export default function ShadeBookScreen() {
  const router = useRouter();
  const { colors, space } = useTheme();
  const book = useShadeBook();
  const pass = usePassPurchase(book.data);
  const pull = usePullToRefresh(book.refetch);
  const [filter, setFilter] = useState<ShadeBookFilter>(NO_FILTER);
  const query = useDeferredValue(filter.query);

  const data = book.data;
  const photos = useMemo(() => new Map((data?.photos ?? []).map((p) => [p.id, p])), [data]);
  const pages = useMemo(() => (data ? filterShadeBook(data.combinations, { ...filter, query }) : []), [data, filter, query]);
  const counts = useMemo(() => colourCounts(data?.combinations ?? []), [data]);
  const filtered = Boolean(filter.photoId || filter.colours || query.trim());
  const set = (patch: Partial<ShadeBookFilter>) => setFilter((f) => ({ ...f, ...patch }));

  const renderItem = useCallback(
    ({ item }: { item: ShadeBookPage }) => (
      <View style={{ paddingBottom: space.md }}>
        <PageCard
          page={item}
          photo={photos.get(item.photoId)}
          open={Boolean(data?.access.open)}
          onPress={() => router.push(`/shade-book/${encodeURIComponent(item.id)}` as Href)}
        />
      </View>
    ),
    [data?.access.open, photos, router, space.md],
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

  let body: ReactNode;
  if (book.isPending) {
    body = (
      <View style={{ paddingHorizontal: space.gutter, gap: space.md, paddingTop: space.md }} testID="shade-book-loading">
        {[0, 1].map((r) => (
          <Skeleton key={r} width="100%" height={260} radius={12} />
        ))}
      </View>
    );
  } else if (book.error || !data) {
    body = <ErrorState error={book.error} onRetry={() => void book.refetch()} />;
  } else if (data.total === 0) {
    body = <EmptyState icon="book-open" title={t("shadeBook.empty")} body={t("shadeBook.emptyBody")} />;
  } else {
    const locked = lockedPages(data);
    const header = (
      <View style={{ gap: space.sm, paddingBottom: space.md }}>
        <Standing book={data} price={pass.price} sellable={pass.sellable} busy={pass.busy} onBuy={() => void pass.buy()} />
        <PassNoticeBanner notice={pass.notice} />
        {data.photos.length > 1
          ? chipsRow(
              <>
                <Chip label={t("shadeBook.everyHouse")} selected={!filter.photoId} onPress={() => set({ photoId: "" })} />
                {data.photos.map((p) => (
                  <Chip key={p.id} label={p.title} selected={filter.photoId === p.id} onPress={() => set({ photoId: p.id })} />
                ))}
              </>,
            )
          : null}
        {counts.length > 1
          ? chipsRow(
              <>
                <Chip label={t("shadeBook.anyColours")} selected={!filter.colours} onPress={() => set({ colours: 0 })} />
                {counts.map((n) => (
                  <Chip key={n} label={t("shadeBook.colours", { n })} selected={filter.colours === n} onPress={() => set({ colours: n })} />
                ))}
              </>,
            )
          : null}
        <Text variant="small" tone="mute" accessibilityLiveRegion="polite">
          {filtered
            ? t("shadeBook.countShown", { shown: pages.length, total: data.combinations.length })
            : data.access.open
              ? t("shadeBook.countAll", { n: data.combinations.length })
              : t("shadeBook.countFree", { shown: data.combinations.length, total: data.total })}
        </Text>
      </View>
    );
    const footer = (
      <View style={{ gap: space.md, paddingTop: space.xs }}>
        {locked > 0 && !filtered ? (
          <Card style={{ gap: space.sm }} testID="shade-book-locked">
            <View style={styles.inline}>
              <Feather name="lock" size={18} color={colors.fgMute} />
              <Text variant="bodyStrong">
                {locked === 1 ? t("shadeBook.lockedOne") : t("shadeBook.lockedMany", { n: locked })}
              </Text>
            </View>
            <Text variant="small" tone="soft">
              {t("shadeBook.lockedBody")}
            </Text>
            <BuyButton book={data} price={pass.price} sellable={pass.sellable} busy={pass.busy} onBuy={() => void pass.buy()} />
          </Card>
        ) : null}
        <Disclaimer kind="shades" />
      </View>
    );
    body = (
      <FlashList
        data={pages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xl }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={{ gap: space.sm, paddingVertical: space.xl }}>
            <Text variant="body" tone="soft">
              {t("shadeBook.noMatch")}
            </Text>
            <Button variant="secondary" block={false} label={t("shadeBook.showAll")} onPress={() => setFilter(NO_FILTER)} />
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
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm }}>
        <CatalogueSwitch value="book" />
        <Text variant="title1" accessibilityRole="header">
          {t("shadeBook.title")}
        </Text>
        <Text variant="small" tone="soft">
          {t("shadeBook.lead")}
        </Text>
        <TextField
          label={t("shadeBook.searchLabel")}
          placeholder={t("shadeBook.searchHint")}
          value={filter.query}
          onChangeText={(next) => set({ query: next })}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          editable={Boolean(data?.combinations.length)}
        />
      </View>
      <View style={styles.fill}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  inline: { flexDirection: "row", alignItems: "center", gap: 10 },
});
