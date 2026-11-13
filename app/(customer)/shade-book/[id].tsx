import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import { shadeBookPicturePath } from "@/api/endpoints/shade-book";
import { BackButton, Button, EmptyState, ErrorState, RemoteImage, Screen, Skeleton, Text } from "@/components/ui";
import { bookHouses, filterFromParams, gridPages, housesFor, ownHouse, partsOn } from "@/features/shade-book/book";
import {
  BuyButton,
  HouseStrip,
  PassNoticeBanner,
  PhotosDenied,
  Swatches,
  kindOf,
  useSavePicture,
  whereOf,
} from "@/features/shade-book/components";
import { usePassPurchase } from "@/features/payments/use-pass-purchase";
import { shadeBookPass } from "@/features/shade-book/pass";
import { useShadeBook } from "@/features/shade-book/use-shade-book";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

/** The most of the screen's height the picture takes, so its codes start in sight under it. */
const PICTURE_SHARE = 0.62;

type Params = { id: string; on?: string; view?: string; kind?: string; colours?: string; families?: string; q?: string };

/**
 * C37 · A Colour Combination Book picture. Spec: docs/04-screens-customer.md — C37.
 *
 * One combination large, opened from the Colour Combination Book's grid: painted on the house the grid
 * showed it on, every part's Vista code, and with the pass its picture to keep — the house over
 * the codes — saved to the photos or sent. Under it, the same combination on every house with as
 * many parts, one press to paint it there; Previous and Next step through the grid it was opened
 * from, whose filter and house come in the route's params (`on`, `kind`, `colours`, `families`,
 * `q`; `view` is the house chosen here). Opened from a link with none, it steps through the book.
 */
export default function ShadeBookPictureScreen() {
  const router = useRouter();
  const { space } = useTheme();
  const screen = useWindowDimensions();
  const params = useLocalSearchParams<Params>();
  const book = useShadeBook();
  const pass = usePassPurchase(book.data?.access, shadeBookPass);
  const picture = useSavePicture();
  const { kind, colours, families, q } = params;
  const filter = useMemo(() => filterFromParams({ kind, colours, families, q }), [kind, colours, families, q]);

  const data = book.data;
  let body;
  if (book.isPending) {
    body = <Skeleton width="100%" height={320} radius={12} />;
  } else if (book.error || !data) {
    body = <ErrorState error={book.error} onRetry={() => void book.refetch()} />;
  } else {
    const houses = bookHouses(data);
    // The grid it was opened from; a page that isn't in it (a link) steps through the whole book.
    let pages = gridPages(data, filter, params.on).pages;
    let index = pages.findIndex((p) => p.id === params.id);
    if (index < 0) {
      pages = data.combinations;
      index = pages.findIndex((p) => p.id === params.id);
    }
    const page = index >= 0 ? pages[index]! : null;
    if (!page) {
      // Taken out of the book, or a page the pass would open and this reader no longer has.
      body = <EmptyState icon="book-open" title={t("shadeBook.notFound")} actionLabel={t("common.back")} onAction={() => router.back()} />;
    } else {
      // The house chosen here, else the one the grid showed it on, else its own.
      const fitting = housesFor(page, houses, filter.kind);
      const house = fitting.find((h) => h.id === params.view) ?? fitting.find((h) => h.id === params.on) ?? ownHouse(page, houses);
      const parts = (house ? partsOn(page, house) : null) ?? page.shades;
      const where = whereOf(page, house);
      const width = screen.width - space.gutter * 2;
      const height = Math.round(Math.min(house ? (width * house.height) / house.width : (width * 3) / 4, screen.height * PICTURE_SHARE));
      const go = (step: number) => {
        const next = pages[(index + step + pages.length) % pages.length];
        if (next) router.setParams({ id: next.id });
      };
      body = (
        <View style={{ gap: space.md }}>
          <RemoteImage
            url={shadeBookPicturePath(page, house, "full")}
            contentFit="contain"
            style={{ width: "100%", height, borderRadius: 12 }}
            accessibilityLabel={t("shadeBook.pageLabel", { title: page.title, house: where.toLowerCase() })}
          />
          <View style={{ gap: space.xs }}>
            <Text variant="label" tone="mute" testID="shade-book-position">
              {t("shadeBook.position", { n: index + 1, total: pages.length })}
            </Text>
            <Text variant="title2" accessibilityRole="header">
              {page.title}
            </Text>
            <Text variant="small" tone="mute">
              {where} · {house ? kindOf(house) : page.scope === "INTERIOR" ? t("shadeBook.interior") : t("shadeBook.exterior")} ·{" "}
              {t("shadeBook.colours", { n: page.colours })}
            </Text>
          </View>
          <Swatches parts={parts} />
          {data.access.open ? (
            <View style={{ gap: space.sm }}>
              <Button label={t("shadeBook.save")} icon="download" onPress={() => picture.save(page, house, "photos")} loading={picture.busy} />
              <Button label={t("shadeBook.share")} icon="share-2" variant="secondary" onPress={() => picture.save(page, house, "share")} disabled={picture.busy} />
              {picture.denied ? <PhotosDenied /> : null}
            </View>
          ) : (
            <View style={{ gap: space.sm }}>
              <Text variant="small" tone="soft">
                {t("shadeBook.unlockToSave")}
              </Text>
              <BuyButton book={data} price={pass.price} sellable={pass.sellable} busy={pass.busy} onBuy={() => void pass.buy()} />
            </View>
          )}
          <PassNoticeBanner notice={pass.notice} />
          {fitting.length > 1 ? (
            <View style={{ gap: space.xs }}>
              <Text variant="label" tone="mute">
                {t("shadeBook.onEvery", { n: page.colours })}
              </Text>
              <HouseStrip houses={fitting} chosen={house?.id ?? null} page={page} onChoose={(h) => router.setParams({ view: h.id })} />
            </View>
          ) : null}
          <Text variant="caption" tone="mute">
            {t("shadeBook.note")}
          </Text>
          {pages.length > 1 ? (
            <View style={[styles.nav, { gap: space.sm }]}>
              <View style={styles.fill}>
                <Button label={t("shadeBook.previous")} icon="chevron-left" variant="secondary" onPress={() => go(-1)} testID="shade-book-previous" />
              </View>
              <View style={styles.fill}>
                <Button label={t("shadeBook.next")} variant="secondary" onPress={() => go(1)} testID="shade-book-next" />
              </View>
            </View>
          ) : null}
        </View>
      );
    }
  }

  return (
    <Screen scroll>
      <View style={{ gap: space.md, paddingBottom: space.xl }}>
        <BackButton fallback="/shade-book" />
        {body}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row" },
  fill: { flex: 1 },
});
