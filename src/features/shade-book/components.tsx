import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { shadeBookPhotoPath } from "@/api/endpoints/shade-book";
import { keys } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";
import type { ShadeBook, ShadeBookPage, ShadeBookPart, ShadeBookPhoto } from "@/api/types";
import { Banner, Button, Pill, RemoteImage, Text, useToast } from "@/components/ui";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

import { passEnds } from "./book";
import type { PassNotice } from "./pass";
import { PictureNotFetched, pictureFile, savePictureToPhotos, sharePicture } from "./pictures";

/** "Room" or "House": what a photo shows. */
export function kindOf(photo: Pick<ShadeBookPhoto, "kind">): string {
  return photo.kind === "INTERIOR" ? t("shadeBook.room") : t("shadeBook.house");
}

/** A combination's colours, a part of the photo at a time: where it goes and its Vista code. */
export function Swatches({ parts }: { parts: ShadeBookPart[] }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      {parts.map((part) => (
        <View key={part.surfaceId} style={styles.swatch} accessible accessibilityLabel={`${part.surfaceLabel}, ${part.shade?.hvCode ?? ""}`}>
          <View
            style={[styles.dot, { backgroundColor: part.shade?.hexCode, borderColor: colors.ruleStrong }]}
          />
          <Text variant="body" tone="soft" style={styles.part}>
            {part.surfaceLabel}
          </Text>
          <Text variant="bodyStrong">{part.shade?.hvCode ?? "—"}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The four photos, small, in a row — the one chosen outlined — each with its number on it and
 * how many colours it takes under it. Its name is read out; a quarter of a phone has no room
 * to print it.
 */
export function PhotoStrip({
  photos,
  chosen,
  onChoose,
}: {
  photos: ShadeBookPhoto[];
  chosen: string;
  onChoose: (photo: ShadeBookPhoto) => void;
}) {
  const { colors, radius, space } = useTheme();
  return (
    <View style={[styles.strip, { gap: space.xs }]} accessibilityRole="radiogroup" accessibilityLabel={t("shadeBook.choosePhoto")}>
      {photos.map((photo, i) => {
        const on = photo.id === chosen;
        return (
          <Pressable
            key={photo.id}
            onPress={() => onChoose(photo)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={t("shadeBook.photoLabel", { n: i + 1, title: photo.title, colours: photo.surfaces.length })}
            testID={`shade-book-photo-${photo.id}`}
            style={[
              styles.photo,
              {
                borderRadius: radius.sm,
                borderColor: on ? colors.fg : colors.rule,
                borderWidth: on ? 2 : StyleSheet.hairlineWidth,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <View>
              <RemoteImage url={shadeBookPhotoPath(photo)} style={[styles.photoImage, { borderRadius: 4 }]} />
              <View style={styles.number}>
                <Text variant="caption" style={[styles.numberText, { color: colors.ivory }]}>
                  {i + 1}
                </Text>
              </View>
            </View>
            <Text variant="caption" tone={on ? "default" : "mute"} numberOfLines={1}>
              {t("shadeBook.colours", { n: photo.surfaces.length })}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * One combination in the list: its colours side by side, its name and its Vista codes — in the
 * order of the parts of the photo it would be painted on (`parts`), so the row reads as the
 * picture does.
 */
export function ComboRow({
  page,
  parts = page.shades,
  chosen,
  free,
  onPress,
}: {
  page: ShadeBookPage;
  parts?: ShadeBookPart[];
  chosen: boolean;
  free: boolean;
  onPress: () => void;
}) {
  const { colors, radius, space } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={`${page.title}, ${parts.map((part) => part.shade?.hvCode ?? "").join(", ")}`}
      style={({ pressed }) => [
        styles.row,
        {
          gap: space.sm,
          padding: space.sm,
          borderRadius: radius.sm,
          borderColor: chosen ? colors.fg : "transparent",
          backgroundColor: chosen || pressed ? colors.surfaceSoft : "transparent",
        },
      ]}
    >
      <View style={[styles.chips, { borderColor: colors.ruleStrong }]}>
        {parts.map((part) => (
          <View key={part.surfaceId} style={[styles.chip, { backgroundColor: part.shade?.hexCode }]} />
        ))}
      </View>
      <View style={styles.rowText}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {page.title}
        </Text>
        <Text variant="caption" tone="mute" numberOfLines={1}>
          {parts.map((part) => part.shade?.hvCode ?? "—").join(" · ")}
        </Text>
      </View>
      {free ? <Pill label={t("shadeBook.free")} tone="accent" /> : null}
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
 * Save a combination's picture on a photo — the photo over every part's Vista code — to the
 * photos, or send it. It needs the pass: a picture that can't be fetched reads the book again,
 * which shuts it if the pass has ended meanwhile.
 */
export function useSavePicture() {
  const toast = useToast();
  const saving = useSubmit();
  const [denied, setDenied] = useState(false);
  const save = (page: ShadeBookPage, photo: ShadeBookPhoto, how: "photos" | "share") =>
    void saving.run(async () => {
      try {
        const uri = await pictureFile(page, photo);
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
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth },
  part: { flex: 1 },
  strip: { flexDirection: "row" },
  photo: { flex: 1, padding: 3, gap: 2, overflow: "hidden" },
  photoImage: { width: "100%", height: 40 },
  // Dark under the number whatever the photo or the theme, as the website's "Painting…" pill.
  number: { position: "absolute", top: 3, left: 3, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,.62)" },
  numberText: { fontWeight: "700", lineHeight: 16 },
  row: { flexDirection: "row", alignItems: "center", borderWidth: 1 },
  chips: { flexDirection: "row", borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, overflow: "hidden" },
  chip: { width: 18, height: 32 },
  rowText: { flex: 1, gap: 2 },
});
