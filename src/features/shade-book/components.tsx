import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { keys } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";
import type { ShadeBook, ShadeBookPage, ShadeBookPhoto } from "@/api/types";
import { Banner, Button, Pill, RemoteImage, Text, useToast } from "@/components/ui";
import { shadeBookPicturePath } from "@/api/endpoints/shade-book";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

import { passEnds } from "./book";
import { PictureNotFetched, pictureFile, savePictureToPhotos, sharePicture } from "./pictures";
import type { PassNotice } from "./pass";

/** "Modern house" — what the page is painted on, or a plain word when the photo isn't known. */
export function houseOf(page: ShadeBookPage, photo: ShadeBookPhoto | undefined): string {
  return photo?.title ?? (page.scope === "INTERIOR" ? t("shadeBook.room") : t("shadeBook.house"));
}

/** A page's colours, a part at a time: where it goes and its Vista code. */
export function Swatches({ page, large = false }: { page: ShadeBookPage; large?: boolean }) {
  const { colors, space } = useTheme();
  const dot = large ? 22 : 16;
  return (
    <View style={{ gap: large ? space.sm : space.xs }}>
      {page.shades.map((part) => (
        <View
          key={part.surfaceId}
          style={styles.swatch}
          accessible
          accessibilityLabel={`${part.surfaceLabel}, ${part.shade?.hvCode ?? ""}`}
        >
          <View
            style={{
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: part.shade?.hexCode,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.ruleStrong,
            }}
          />
          <Text variant={large ? "body" : "small"} tone="soft" style={styles.part}>
            {part.surfaceLabel}
          </Text>
          <Text variant={large ? "bodyStrong" : "code"}>{part.shade?.hvCode ?? "—"}</Text>
        </View>
      ))}
    </View>
  );
}

/** One page in the list: the house in its colours, its name, its codes. */
export function PageCard({
  page,
  photo,
  open,
  onPress,
}: {
  page: ShadeBookPage;
  photo: ShadeBookPhoto | undefined;
  open: boolean;
  onPress: () => void;
}) {
  const { colors, radius, space } = useTheme();
  const house = houseOf(page, photo);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("shadeBook.pageLabel", { title: page.title, house: house.toLowerCase() })}
      style={({ pressed }) => [
        styles.card,
        { borderRadius: radius.md, borderColor: colors.rule, backgroundColor: colors.surface, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <View>
        <RemoteImage
          url={shadeBookPicturePath(page, photo?.version, "thumb")}
          style={{ width: "100%", aspectRatio: photo ? photo.width / photo.height : 4 / 3 }}
        />
        {page.sample && !open ? (
          <View style={[styles.badge, { top: space.sm, left: space.sm }]}>
            <Pill label={t("shadeBook.sample")} />
          </View>
        ) : null}
      </View>
      <View style={{ padding: space.md, gap: space.xs }}>
        <Text variant="bodyStrong">{page.title}</Text>
        <Text variant="small" tone="mute">
          {house} · {t("shadeBook.colours", { n: page.colours })}
        </Text>
        <View style={{ paddingTop: space.xs }}>
          <Swatches page={page} />
        </View>
      </View>
    </Pressable>
  );
}

/** Where the reader stands: the pass and when it ends, an admin's open book, or what opening it costs. */
export function Standing({
  book,
  price,
  sellable,
  busy,
  onBuy,
}: {
  book: ShadeBook;
  price: string | null;
  sellable: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  const { access } = book;
  if (access.reason === "ADMIN") return <Banner tone="info" message={t("shadeBook.adminOpen")} />;
  if (access.open) {
    const ends = passEnds(access.expiresAt);
    return (
      <Banner
        tone="success"
        title={ends ? t("shadeBook.openUntil", { time: ends }) : t("shadeBook.openedPlain")}
        message={t("shadeBook.openBody")}
      />
    );
  }
  return (
    <Banner
      tone="info"
      title={t("shadeBook.countFree", { shown: book.combinations.length, total: book.total })}
      message={t("shadeBook.shutBody", { hours: access.hours })}
    >
      <BuyButton book={book} price={price} sellable={sellable} busy={busy} onBuy={onBuy} />
    </Banner>
  );
}

/** Buy the pass — or say plainly that it can't be bought here. */
export function BuyButton({
  book,
  price,
  sellable,
  busy,
  onBuy,
}: {
  book: ShadeBook;
  price: string | null;
  sellable: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  if (!sellable) {
    return (
      <Text variant="small" tone="mute">
        {t("shadeBook.notSold")}
      </Text>
    );
  }
  const label = price
    ? t("shadeBook.buy", { total: book.total, price, hours: book.access.hours })
    : t("shadeBook.buyNoPrice", { total: book.total, hours: book.access.hours });
  return <Button label={label} onPress={onBuy} loading={busy} testID="shade-book-buy" />;
}

/** What became of the last purchase. */
export function PassNoticeBanner({ notice }: { notice: PassNotice | null }) {
  if (!notice) return null;
  return <Banner tone={notice.tone} message={notice.message} testID="shade-book-notice" />;
}

/**
 * Save a page's picture — the house over every part's Vista code — to the photos, or send
 * it. It needs the pass: a picture that can't be fetched reads the book again, which shuts
 * it if the pass has ended meanwhile.
 */
export function useSavePicture() {
  const toast = useToast();
  const saving = useSubmit();
  const [denied, setDenied] = useState(false);
  const save = (page: ShadeBookPage, how: "photos" | "share") =>
    void saving.run(async () => {
      try {
        const uri = await pictureFile(page);
        if (how === "share") {
          await sharePicture(uri, t("shadeBook.shareTitle"));
          return;
        }
        const result = await savePictureToPhotos(uri);
        setDenied(result === "denied");
        if (result === "saved") toast.show(t("shadeBook.saved"), "success");
      } catch (err) {
        if (err instanceof PictureNotFetched) void queryClient.invalidateQueries({ queryKey: keys.shadeBook });
        toast.show(t("shadeBook.saveFailed"), "error");
      }
    });
  return { save, busy: saving.busy, denied };
}

/** Saving to the photos was refused: Settings can change that. */
export function PhotosDenied() {
  return (
    <Banner tone="warning" message={t("shadeBook.photosDenied")}>
      <Button variant="ghost" block={false} label={t("shadeBook.openSettings")} onPress={() => void Linking.openSettings().catch(() => {})} />
    </Banner>
  );
}

const styles = StyleSheet.create({
  swatch: { flexDirection: "row", alignItems: "center", gap: 10 },
  part: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  badge: { position: "absolute" },
});
