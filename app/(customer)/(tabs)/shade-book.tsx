import Feather from "@expo/vector-icons/Feather";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import { shadeBookPhotoPath, shadeBookPicturePath } from "@/api/endpoints/shade-book";
import type { ShadeBookPage, ShadeBookPhoto } from "@/api/types";
import { Button, Card, Disclaimer, EmptyState, ErrorState, RemoteImage, Screen, Skeleton, Text, TextField } from "@/components/ui";
import { combinationsFor, firstPhoto, lockedFor, partsOn, searchShadeBook } from "@/features/shade-book/book";
import { CatalogueSwitch } from "@/features/shade-book/CatalogueSwitch";
import {
  BuyButton,
  ComboRow,
  PassNoticeBanner,
  PhotoStrip,
  PhotosDenied,
  Standing,
  Swatches,
  kindOf,
  useSavePicture,
} from "@/features/shade-book/components";
import { usePassPurchase } from "@/features/shade-book/use-pass-purchase";
import { useShadeBook } from "@/features/shade-book/use-shade-book";
import { t } from "@/i18n";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

/** The most of the screen's height the chosen photo takes, so the combinations keep the rest. */
const PHOTO_SHARE = 0.3;

/**
 * C34 · Shade Book. Spec: docs/04-screens-customer.md — C34. In the Catalogue tab, beside the
 * shades: the switch at the top of both screens, and the tab stays lit.
 *
 * Photo first, and the photo stays: the colour test's four photos small across the top — two
 * rooms, two houses, two parts to paint or three — and the chosen one large under them, held
 * there while everything below scrolls: every combination with as many colours as it has parts.
 * Choosing one paints it on the photo in sight (the server paints it, as it does for the
 * website and the picture saved), with each part's Vista code. The first few of each number of
 * colours are free; the 24-hour pass opens the rest and lets each picture be saved with its
 * codes. What is open is the server's answer — this screen only shows it.
 */
export default function ShadeBookScreen() {
  const { colors, space } = useTheme();
  const screen = useWindowDimensions();
  const book = useShadeBook();
  const pass = usePassPurchase(book.data);
  const picture = useSavePicture();
  const pull = usePullToRefresh(book.refetch);
  const listRef = useRef<FlashListRef<ShadeBookPage>>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const data = book.data;
  const photo = data ? (data.photos.find((p) => p.id === photoId) ?? firstPhoto(data)) : undefined;
  const fitting = useMemo(() => (data && photo ? combinationsFor(data.combinations, photo) : []), [data, photo]);
  const list = useMemo(() => searchShadeBook(fitting, query), [fitting, query]);
  const chosen = fitting.find((p) => p.id === chosenId) ?? list[0] ?? fitting[0] ?? null;
  const parts = chosen && photo ? partsOn(chosen, photo) : null;
  const open = Boolean(data?.access.open);

  // A combination stays chosen on another photo with as many parts; otherwise the new photo's
  // first is, and its list — another number of colours — starts from the top.
  const choosePhoto = (next: ShadeBookPhoto) => {
    setPhotoId(next.id);
    if (chosen && chosen.colours === next.surfaces.length) return;
    setChosenId(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  // The photo is in sight above the list, so choosing a combination only paints it there.
  const renderItem = useCallback(
    ({ item }: { item: ShadeBookPage }) => (
      <ComboRow
        page={item}
        parts={(photo && partsOn(item, photo)) ?? item.shades}
        chosen={item.id === chosen?.id}
        free={item.sample && !open}
        onPress={() => setChosenId(item.id)}
      />
    ),
    [chosen?.id, open, photo],
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
  } else if (data.total === 0 || !photo) {
    body = <EmptyState icon="book-open" title={t("shadeBook.empty")} body={t("shadeBook.emptyBody")} />;
  } else {
    const colourCount = photo.surfaces.length;
    const locked = lockedFor(data, colourCount);
    // As tall as the photo at the screen's width, up to its share of the height; contained in it.
    const width = screen.width - space.gutter * 2;
    const height = Math.round(Math.min((width * photo.height) / photo.width, screen.height * PHOTO_SHARE));
    stage = (
      <View style={{ gap: space.xs }}>
        <PhotoStrip photos={data.photos} chosen={photo.id} onChoose={choosePhoto} />
        <RemoteImage
          url={chosen ? shadeBookPicturePath(chosen, photo, "full") : shadeBookPhotoPath(photo)}
          contentFit="contain"
          style={{ width: "100%", height, borderRadius: 12, marginTop: space.xs }}
          accessibilityLabel={chosen ? t("shadeBook.pageLabel", { title: chosen.title, house: photo.title.toLowerCase() }) : photo.title}
        />
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
        {chosen && parts ? (
          <Card style={{ gap: space.sm }} testID="shade-book-chosen">
            <View style={{ gap: 2 }}>
              <Text variant="title3" accessibilityRole="header">
                {chosen.title}
              </Text>
              <Text variant="small" tone="mute">
                {photo.title} · {kindOf(photo)} · {t("shadeBook.colours", { n: colourCount })}
              </Text>
            </View>
            <Swatches parts={parts} />
            {open ? (
              <View style={{ gap: space.sm }}>
                <Button label={t("shadeBook.save")} icon="download" onPress={() => picture.save(chosen, photo, "photos")} loading={picture.busy} />
                <Button label={t("shadeBook.share")} icon="share-2" variant="secondary" onPress={() => picture.save(chosen, photo, "share")} disabled={picture.busy} />
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
        <View style={styles.listHead}>
          <Text variant="title3" accessibilityRole="header">
            {t("shadeBook.combinations")}
          </Text>
          <Text variant="caption" tone="mute">
            {t("shadeBook.colours", { n: colourCount })} · {fitting.length}
            {locked > 0 ? ` / ${fitting.length + locked}` : ""}
          </Text>
        </View>
        <TextField
          label={t("shadeBook.searchLabel")}
          placeholder={t("shadeBook.searchHint")}
          value={query}
          onChangeText={setQuery}
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
                {locked === 1 ? t("shadeBook.lockedOne", { colours: colourCount }) : t("shadeBook.lockedMany", { n: locked, colours: colourCount })}
              </Text>
            </View>
            <Text variant="small" tone="soft">
              {t("shadeBook.lockedBody", { colours: colourCount })}
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
        data={list}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        extraData={chosen?.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xl }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={{ gap: space.sm, paddingVertical: space.lg }}>
            <Text variant="body" tone="soft">
              {fitting.length === 0 ? t("shadeBook.noneYet", { colours: colourCount }) : t("shadeBook.noMatch")}
            </Text>
            {fitting.length > 0 ? (
              <Button variant="secondary" block={false} label={t("shadeBook.showAll")} onPress={() => setQuery("")} />
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
      {/* The switch, the four photos and the chosen one stay put; the rest scrolls under them. */}
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
