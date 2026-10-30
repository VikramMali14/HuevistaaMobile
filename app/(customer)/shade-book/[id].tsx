import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";

import { shadeBookPicturePath } from "@/api/endpoints/shade-book";
import { BackButton, Button, EmptyState, ErrorState, RemoteImage, Screen, Skeleton, Text } from "@/components/ui";
import { BuyButton, PassNoticeBanner, PhotosDenied, Swatches, houseOf, useSavePicture } from "@/features/shade-book/components";
import { usePassPurchase } from "@/features/shade-book/use-pass-purchase";
import { useShadeBook } from "@/features/shade-book/use-shade-book";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * C35 · A Shade Book page. Spec: docs/04-screens-customer.md — C35.
 *
 * One combination large, on its house, with every part's Vista code; with the pass, its
 * picture to keep — the house over the codes — saved to the photos or sent. Previous and
 * Next step through the book as the reader may read it.
 */
export default function ShadeBookPageScreen() {
  const router = useRouter();
  const { space } = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const book = useShadeBook();
  const pass = usePassPurchase(book.data);
  const picture = useSavePicture();

  const data = book.data;
  const pages = data?.combinations ?? [];
  const index = pages.findIndex((p) => p.id === params.id);
  const page = index >= 0 ? pages[index]! : null;
  const photo = page ? data?.photos.find((p) => p.id === page.photoId) : undefined;
  const go = (step: number) => {
    const next = pages[(index + step + pages.length) % pages.length];
    if (next) router.setParams({ id: next.id });
  };

  let body;
  if (book.isPending) {
    body = <Skeleton width="100%" height={320} radius={12} />;
  } else if (book.error || !data) {
    body = <ErrorState error={book.error} onRetry={() => void book.refetch()} />;
  } else if (!page) {
    // Taken out of the book, or a page the pass would open and this reader no longer has.
    body = <EmptyState icon="book-open" title={t("shadeBook.notFound")} actionLabel={t("common.back")} onAction={() => router.back()} />;
  } else {
    const house = houseOf(page, photo);
    body = (
      <View style={{ gap: space.md }}>
        <RemoteImage
          url={shadeBookPicturePath(page, photo?.version, "full")}
          contentFit="contain"
          style={{ width: "100%", aspectRatio: photo ? photo.width / photo.height : 4 / 3, borderRadius: 12 }}
          accessibilityLabel={t("shadeBook.pageLabel", { title: page.title, house: house.toLowerCase() })}
        />
        <View style={{ gap: space.xs }}>
          <Text variant="label" tone="mute">
            {t("shadeBook.position", { n: index + 1, total: pages.length })}
          </Text>
          <Text variant="title2" accessibilityRole="header">
            {page.title}
          </Text>
          <Text variant="small" tone="mute">
            {house} · {t("shadeBook.colours", { n: page.colours })}
          </Text>
        </View>
        <Swatches page={page} large />
        {data.access.open ? (
          <View style={{ gap: space.sm }}>
            <Button label={t("shadeBook.save")} icon="download" onPress={() => picture.save(page, "photos")} loading={picture.busy} />
            <Button label={t("shadeBook.share")} icon="share-2" variant="secondary" onPress={() => picture.save(page, "share")} disabled={picture.busy} />
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
        <Text variant="caption" tone="mute">
          {t("shadeBook.note")}
        </Text>
        {pages.length > 1 ? (
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label={t("shadeBook.previous")} icon="chevron-left" variant="secondary" onPress={() => go(-1)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t("shadeBook.next")} variant="secondary" onPress={() => go(1)} />
            </View>
          </View>
        ) : null}
      </View>
    );
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
