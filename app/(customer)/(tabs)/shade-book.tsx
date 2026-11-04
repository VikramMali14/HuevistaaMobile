import Feather from "@expo/vector-icons/Feather";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import { shadeBookPhotoPath, shadeBookPicturePath } from "@/api/endpoints/shade-book";
import type { ShadeBookPage } from "@/api/types";
import { Button, Card, Disclaimer, EmptyState, ErrorState, RemoteImage, Screen, Skeleton, Text, TextField } from "@/components/ui";
import {
  NO_FILTER,
  bookHouses,
  familyCounts,
  filterShadeBook,
  housesFor,
  housesWhere,
  lockedFor,
  partsOn,
  type ShadeBookFilter,
} from "@/features/shade-book/book";
import { CatalogueSwitch } from "@/features/shade-book/CatalogueSwitch";
import {
  BuyButton,
  ComboRow,
  Filters,
  HouseStrip,
  PassNoticeBanner,
  PhotosDenied,
  Standing,
  Swatches,
  kindOf,
  useSavePicture,
} from "@/features/shade-book/components";
import { useShadeBook } from "@/features/shade-book/use-shade-book";
import { t } from "@/i18n";
import { usePassPurchase } from "@/features/payments/use-pass-purchase";
import { shadeBookPass } from "@/features/shade-book/pass";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

/** The most of the screen's height the chosen photo takes, so the combinations keep the rest. */
const PHOTO_SHARE = 0.28;

/**
 * C34 · Shade Book. Spec: docs/04-screens-customer.md — C34. In the Catalogue tab, beside the
 * shades: the switch at the top of both screens, and the tab stays lit.
 *
 * The photo stays: along the top, every house the chosen combination fits — the colour test's
 * four and the houses and rooms the team adds — small and painted with it, in a row that scrolls
 * sideways, and the one chosen large under them, held there while everything below scrolls. Below,
 * what to look at — exterior or interior, two colours or three, the colour families a combination
 * must have — and the combinations that fit. Choosing one paints it on every house in the row (the
 * server paints it, as it does for the website and the picture saved), with each part's Vista
 * code. The first few of each kind and number of colours are free; the 24-hour pass opens the
 * rest and lets each picture be saved with its codes. What is open is the server's answer — this
 * screen only shows it.
 */
export default function ShadeBookScreen() {
  const { colors, space } = useTheme();
  const screen = useWindowDimensions();
  const book = useShadeBook();
  const pass = usePassPurchase(book.data?.access, shadeBookPass);
  const picture = useSavePicture();
  const pull = usePullToRefresh(book.refetch);
  const listRef = useRef<FlashListRef<ShadeBookPage>>(null);
  const [filter, setFilter] = useState<ShadeBookFilter>(NO_FILTER);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [houseId, setHouseId] = useState<string | null>(null);

  const data = book.data;
  const houses = useMemo(() => (data ? bookHouses(data) : []), [data]);
  const list = useMemo(() => (data ? filterShadeBook(data.combinations, filter) : []), [data, filter]);
  const chosen = list.find((p) => p.id === chosenId) ?? list[0] ?? null;
  const fitting = useMemo(
    () => (chosen ? housesFor(chosen, houses, filter.kind) : housesWhere(houses, filter)),
    [chosen, houses, filter],
  );
  // The house chosen stays while it fits; otherwise the combination's own photo, or the first like it.
  const house = fitting.find((h) => h.id === houseId) ?? fitting[0];
  const counts = useMemo(() => (data ? familyCounts(data, filter) : {}), [data, filter]);
  const parts = chosen && house ? partsOn(chosen, house) : null;
  const open = Boolean(data?.access.open);
  const filtered = filter.kind !== "ALL" || filter.colours !== 0 || filter.families.length > 0;

  // A new filter's list starts from the top.
  const narrow = (next: ShadeBookFilter) => {
    setFilter(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  // The photo is in sight above the list, so choosing a combination only paints it there. A row
  // reads as the picture would: in the order of the house in sight's parts, when it fits it.
  const renderItem = useCallback(
    ({ item }: { item: ShadeBookPage }) => (
      <ComboRow
        page={item}
        parts={(house && item.colours === house.surfaces.length ? partsOn(item, house) : null) ?? item.shades}
        chosen={item.id === chosen?.id}
        free={item.sample && !open}
        onPress={() => setChosenId(item.id)}
      />
    ),
    [chosen?.id, open, house],
  );

  let stage: ReactNode = null;
  let body: ReactNode;
  if (book.isPending) {
    body = (
      <View style={{ paddingHorizontal: space.gutter, gap: space.md, paddingTop: space.sm }} testID="shade-book-loading">
        <Skeleton width="100%" height={64} radius={10} />
        <Skeleton width="100%" height={220} radius={12} />
      </View>
    );
  } else if (book.error || !data) {
    body = <ErrorState error={book.error} onRetry={() => void book.refetch()} />;
  } else if (data.total === 0 || houses.length === 0) {
    body = <EmptyState icon="book-open" title={t("shadeBook.empty")} body={t("shadeBook.emptyBody")} />;
  } else {
    const locked = lockedFor(data, filter);
    // As tall as the photo at the screen's width, up to its share of the height; contained in it.
    const width = screen.width - space.gutter * 2;
    const height = house ? Math.round(Math.min((width * house.height) / house.width, screen.height * PHOTO_SHARE)) : 0;
    stage = (
      <View style={{ gap: space.xs }}>
        <HouseStrip houses={fitting} chosen={house?.id ?? null} page={chosen} onChoose={(h) => setHouseId(h.id)} />
        {house ? (
          <RemoteImage
            url={chosen ? shadeBookPicturePath(chosen, house, "full") : shadeBookPhotoPath(house)}
            contentFit="contain"
            style={{ width: "100%", height, borderRadius: 12, marginTop: space.xs }}
            accessibilityLabel={chosen ? t("shadeBook.pageLabel", { title: chosen.title, house: house.title.toLowerCase() }) : house.title}
          />
        ) : null}
        {/* What is on the photo while the list scrolls away from its card; the card says it in full. */}
        {chosen && parts ? (
          <Text variant="caption" tone="soft" numberOfLines={1} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="shade-book-caption">
            {chosen.title} · {parts.map((part) => part.shade?.hvCode ?? "—").join(" · ")}
          </Text>
        ) : null}
      </View>
    );
    const header = (
      <View style={{ gap: space.md, paddingTop: space.sm, paddingBottom: space.sm }}>
        <Standing book={data} price={pass.price} sellable={pass.sellable} busy={pass.busy} onBuy={() => void pass.buy()} />
        <PassNoticeBanner notice={pass.notice} />
        {chosen && parts && house ? (
          <Card style={{ gap: space.sm }} testID="shade-book-chosen">
            <View style={{ gap: 2 }}>
              <Text variant="title3" accessibilityRole="header">
                {chosen.title}
              </Text>
              <Text variant="small" tone="mute">
                {house.title} · {kindOf(house)} · {t("shadeBook.colours", { n: house.surfaces.length })}
              </Text>
            </View>
            <Swatches parts={parts} />
            {open ? (
              <View style={{ gap: space.sm }}>
                <Button label={t("shadeBook.save")} icon="download" onPress={() => picture.save(chosen, house, "photos")} loading={picture.busy} />
                <Button label={t("shadeBook.share")} icon="share-2" variant="secondary" onPress={() => picture.save(chosen, house, "share")} disabled={picture.busy} />
                {picture.denied ? <PhotosDenied /> : null}
              </View>
            ) : (
              <Text variant="small" tone="soft">
                {t("shadeBook.unlockToSave")}
              </Text>
            )}
            <Text variant="caption" tone="mute">
              {t("shadeBook.note")}
            </Text>
          </Card>
        ) : null}
        <Filters filter={filter} counts={counts} onChange={narrow} />
        <View style={styles.listHead}>
          <Text variant="title3" accessibilityRole="header">
            {t("shadeBook.combinations")}
          </Text>
          <Text variant="caption" tone="mute">
            {list.length}
            {locked > 0 ? ` / ${list.length + locked}` : ""}
          </Text>
        </View>
        <TextField
          label={t("shadeBook.searchLabel")}
          placeholder={t("shadeBook.searchHint")}
          value={filter.query}
          onChangeText={(query) => setFilter((f) => ({ ...f, query }))}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
    );
    const footer = (
      <View style={{ gap: space.md, paddingTop: space.sm }}>
        {locked > 0 ? (
          <Card style={{ gap: space.sm }} testID="shade-book-locked">
            <View style={[styles.inline, { gap: 10 }]}>
              <Feather name="lock" size={18} color={colors.fgMute} />
              <Text variant="bodyStrong">
                {filtered ? t("shadeBook.lockedLike", { n: locked }) : t("shadeBook.lockedAll", { n: locked })}
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
    const query = filter.query.trim();
    body = (
      <FlashList
        ref={listRef}
        data={list}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        extraData={[chosen?.id, house?.id]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xl }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={{ gap: space.sm, paddingVertical: space.lg }}>
            <Text variant="body" tone="soft">
              {query ? t("shadeBook.noMatch") : locked > 0 ? t("shadeBook.noneFree") : t("shadeBook.noneLike")}
            </Text>
            {query ? (
              <Button variant="secondary" block={false} label={t("shadeBook.showAll")} onPress={() => setFilter((f) => ({ ...f, query: "" }))} />
            ) : filtered && locked === 0 ? (
              <Button variant="secondary" block={false} label={t("shadeBook.showAll")} onPress={() => narrow({ ...NO_FILTER })} />
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
      {/* The switch, the houses and the chosen one stay put; the rest scrolls under them. */}
      <View style={[styles.top, { paddingHorizontal: space.gutter, paddingTop: space.sm, paddingBottom: space.xs, gap: space.sm, borderBottomColor: colors.rule }]}>
        <CatalogueSwitch value="book" />
        {stage}
      </View>
      <View style={styles.fill}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { borderBottomWidth: StyleSheet.hairlineWidth },
  fill: { flex: 1 },
  inline: { flexDirection: "row", alignItems: "center" },
  listHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
});
