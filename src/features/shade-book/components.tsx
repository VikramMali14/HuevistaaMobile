import Feather from "@expo/vector-icons/Feather";
import { useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { shadeBookPhotoPath, shadeBookPicturePath } from "@/api/endpoints/shade-book";
import { keys } from "@/api/query-keys";
import { queryClient } from "@/api/query-client";
import type { ShadeBook, ShadeBookPage, ShadeBookPart, ShadeBookPhoto } from "@/api/types";
import { Banner, Button, RemoteImage, Segmented, Text, useToast } from "@/components/ui";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { fonts, hairline, useTheme } from "@/theme";

import { NO_FILTER, SHADE_FAMILIES, partsOn, passEnds, type ShadeBookFilter, type ShadeBookKind } from "./book";
import type { PassNotice } from "@/features/payments/day-pass";
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
 * Every house the chosen combination fits, small, in a row that scrolls sideways — each painted
 * with it (`page`), or as it is while nothing is chosen — the one in sight outlined, its number
 * on it and its name under it.
 */
export function HouseStrip({
  houses,
  chosen,
  page,
  onChoose,
}: {
  houses: ShadeBookPhoto[];
  chosen: string | null;
  page: ShadeBookPage | null;
  onChoose: (house: ShadeBookPhoto) => void;
}) {
  const { colors, radius, space } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={t("shadeBook.chooseHouse")}
      contentContainerStyle={{ gap: space.xs }}
      testID="shade-book-houses"
    >
      {houses.map((house, i) => {
        const on = house.id === chosen;
        return (
          <Pressable
            key={house.id}
            onPress={() => onChoose(house)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={t("shadeBook.houseLabel", { n: i + 1, title: house.title, kind: kindOf(house), colours: house.surfaces.length })}
            testID={`shade-book-photo-${house.id}`}
            style={[
              styles.house,
              {
                borderRadius: radius.sm,
                borderColor: on ? colors.fg : colors.rule,
                borderWidth: on ? 2 : StyleSheet.hairlineWidth,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <View>
              <RemoteImage
                url={page ? shadeBookPicturePath(page, house, "mini") : shadeBookPhotoPath(house)}
                style={[styles.houseImage, { borderRadius: 4 }]}
              />
              <View style={styles.number}>
                <Text variant="caption" style={[styles.numberText, { color: colors.ivory }]}>
                  {i + 1}
                </Text>
              </View>
            </View>
            <Text variant="caption" tone={on ? "default" : "mute"} numberOfLines={1}>
              {house.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * What to look at: exterior or interior, two colours or three, and the colour families a
 * combination must have every one of — each chip saying how many in the whole book it would
 * show, a family that would show none greyed.
 */
export function Filters({
  filter,
  counts,
  onChange,
}: {
  filter: ShadeBookFilter;
  counts: Record<string, number>;
  onChange: (next: ShadeBookFilter) => void;
}) {
  const { space } = useTheme();
  const filtered = filter.kind !== "ALL" || filter.colours !== 0 || filter.families.length > 0;
  const toggle = (id: string) =>
    onChange({ ...filter, families: filter.families.includes(id) ? filter.families.filter((f) => f !== id) : [...filter.families, id] });
  return (
    <View style={{ gap: space.sm }} testID="shade-book-filters">
      <Segmented<ShadeBookKind>
        accessibilityLabel={t("shadeBook.where")}
        value={filter.kind}
        onChange={(kind) => onChange({ ...filter, kind })}
        options={[
          { value: "ALL", label: t("shadeBook.all") },
          { value: "EXTERIOR", label: t("shadeBook.exterior") },
          { value: "INTERIOR", label: t("shadeBook.interior") },
        ]}
      />
      <Segmented<"0" | "2" | "3">
        accessibilityLabel={t("shadeBook.coloursFilter")}
        value={String(filter.colours) as "0" | "2" | "3"}
        onChange={(v) => onChange({ ...filter, colours: Number(v) as ShadeBookFilter["colours"] })}
        options={[
          { value: "0", label: t("shadeBook.anyColours") },
          { value: "2", label: t("shadeBook.twoColours") },
          { value: "3", label: t("shadeBook.threeColours") },
        ]}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel={t("shadeBook.shades")}
        contentContainerStyle={{ gap: space.xs, alignItems: "center" }}
      >
        {SHADE_FAMILIES.map((family) => (
          <FamilyChip
            key={family.id}
            label={t(`shadeBook.family.${family.id}`)}
            swatch={family.swatch}
            count={counts[family.id] ?? 0}
            selected={filter.families.includes(family.id)}
            onPress={() => toggle(family.id)}
          />
        ))}
        {filtered ? (
          <Button
            variant="ghost"
            block={false}
            label={t("shadeBook.clearFilters")}
            onPress={() => onChange({ ...NO_FILTER, query: filter.query })}
            testID="shade-book-clear"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

/** One colour family: its dot, its name and how many it would show; chosen is inverted, as the Chip is. */
function FamilyChip({
  label,
  swatch,
  count,
  selected,
  onPress,
}: {
  label: string;
  swatch: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  const disabled = !selected && count === 0;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={t("shadeBook.familyLabel", { family: label, n: count })}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.family,
        {
          borderRadius: radius.pill,
          backgroundColor: selected ? colors.fg : pressed ? colors.surfaceSoft : colors.surface,
          borderColor: selected ? colors.fg : colors.ruleStrong,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <View style={[styles.familyDot, { backgroundColor: swatch, borderColor: colors.ruleStrong }]} />
      <Text style={[styles.familyLabel, { color: selected ? colors.bg : colors.fgSoft }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.familyCount, { color: selected ? colors.bg : colors.fgMute }]}>{count}</Text>
    </Pressable>
  );
}

/** What a page is painted on, in words: its house's name, or "House" or "Room" with no photo to name. */
export function whereOf(page: Pick<ShadeBookPage, "scope">, house: ShadeBookPhoto | undefined): string {
  return house?.title ?? (page.scope === "INTERIOR" ? t("shadeBook.room") : t("shadeBook.house"));
}

/**
 * One combination in the grid: painted on its house — pressing it opens it large — then its
 * name, the house, and each part's Vista code by its colour, in the order of that house's parts
 * as the picture has them. `frame` is the picture's shape: the house's own while every picture
 * is on one house, else one each house sits in whole.
 */
export function PageCard({
  page,
  house,
  frame,
  free,
  onPress,
}: {
  page: ShadeBookPage;
  house: ShadeBookPhoto | undefined;
  frame: number;
  free: boolean;
  onPress: () => void;
}) {
  const { colors, radius, space } = useTheme();
  const parts = (house ? partsOn(page, house) : null) ?? page.shades;
  const where = whereOf(page, house);
  const codes = parts.map((part) => part.shade?.hvCode ?? "—");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("shadeBook.cardLabel", { title: page.title, house: where, codes: codes.join(", ") })}
      accessibilityHint={t("shadeBook.cardHint")}
      testID={`shade-book-page-${page.id}`}
      style={({ pressed }) => [
        styles.card,
        { borderRadius: radius.md, borderColor: colors.rule, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={{ aspectRatio: frame, backgroundColor: colors.surfaceSoft }}>
        <RemoteImage url={shadeBookPicturePath(page, house, "thumb")} contentFit="contain" style={StyleSheet.absoluteFill} />
        {free ? (
          <View style={styles.free}>
            <Text variant="caption" style={[styles.freeText, { color: colors.ivory }]}>
              {t("shadeBook.free")}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ padding: space.sm, gap: 3 }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {page.title}
        </Text>
        <Text variant="caption" tone="mute" numberOfLines={1}>
          {where} · {t("shadeBook.colours", { n: page.colours })}
        </Text>
        <View style={styles.codes}>
          {parts.map((part, i) => (
            <View key={part.surfaceId} style={styles.code}>
              <View style={[styles.codeDot, { backgroundColor: part.shade?.hexCode, borderColor: colors.ruleStrong }]} />
              <Text variant="caption" tone="soft">
                {codes[i]}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Which house the grid is painted on: each combination on its own house, or all of them on one
 * of the houses the filter keeps — each shown as it is, with its name — in a row that scrolls
 * sideways.
 */
export function HouseChooser({
  houses,
  chosen,
  onChoose,
}: {
  houses: ShadeBookPhoto[];
  chosen: string | null;
  onChoose: (id: string | null) => void;
}) {
  const { colors, radius, space } = useTheme();
  const option = (id: string | null, title: string, meta: string, label: string, picture: ReactNode) => {
    const on = id === chosen;
    return (
      <Pressable
        key={id ?? "own"}
        onPress={() => onChoose(id)}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={label}
        testID={`shade-book-on-${id ?? "own"}`}
        style={[
          styles.onHouse,
          {
            gap: space.xs,
            borderRadius: radius.sm,
            borderColor: on ? colors.fg : colors.ruleStrong,
            borderWidth: on ? 2 : StyleSheet.hairlineWidth,
            backgroundColor: colors.surface,
          },
        ]}
      >
        {picture}
        <View style={styles.onText}>
          <Text variant="small" numberOfLines={1} style={styles.onTitle}>
            {title}
          </Text>
          <Text variant="caption" tone="mute" numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </Pressable>
    );
  };
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label" tone="mute">
        {t("shadeBook.showOn")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityRole="radiogroup"
        accessibilityLabel={t("shadeBook.showOn")}
        contentContainerStyle={{ gap: space.xs }}
        testID="shade-book-on"
      >
        {option(
          null,
          t("shadeBook.everyHouse"),
          t("shadeBook.eachOwn"),
          t("shadeBook.everyHouseLabel"),
          <View style={[styles.onPicture, styles.onIcon, { backgroundColor: colors.surfaceSoft }]}>
            <Feather name="grid" size={18} color={colors.fgMute} />
          </View>,
        )}
        {houses.map((house) =>
          option(
            house.id,
            house.title,
            `${kindOf(house)} · ${t("shadeBook.colours", { n: house.surfaces.length })}`,
            t("shadeBook.onLabel", { title: house.title, kind: kindOf(house), colours: house.surfaces.length }),
            <RemoteImage url={shadeBookPhotoPath(house)} style={[styles.onPicture, { borderRadius: 4 }]} />,
          ),
        )}
      </ScrollView>
    </View>
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
  const save = (page: ShadeBookPage, photo: ShadeBookPhoto | undefined, how: "photos" | "share") =>
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
  house: { width: 84, padding: 3, gap: 2, overflow: "hidden" },
  houseImage: { width: "100%", height: 48 },
  family: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingLeft: 8, paddingRight: 12, borderWidth: hairline },
  familyDot: { width: 14, height: 14, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth },
  familyLabel: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18 },
  familyCount: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  // Dark under the number whatever the photo or the theme, as the website's "Painting…" pill.
  number: { position: "absolute", top: 3, left: 3, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,.62)" },
  numberText: { fontWeight: "700", lineHeight: 16 },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  // Dark under the word whatever the photo or the theme, as the number on a house is.
  free: { position: "absolute", top: 6, left: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, backgroundColor: "rgba(0,0,0,.62)" },
  freeText: { fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  codes: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 4, marginTop: 2 },
  code: { flexDirection: "row", alignItems: "center", gap: 5 },
  codeDot: { width: 14, height: 14, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth },
  onHouse: { flexDirection: "row", alignItems: "center", maxWidth: 230, paddingVertical: 4, paddingLeft: 4, paddingRight: 12 },
  onPicture: { width: 48, height: 36 },
  onIcon: { alignItems: "center", justifyContent: "center", borderRadius: 4 },
  onText: { flexShrink: 1, gap: 1 },
  onTitle: { fontFamily: fonts.medium },
});
