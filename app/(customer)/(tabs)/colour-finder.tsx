import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from "react-native";

import type { ColourFinderAccess, VistaShadeMatch } from "@/api/types";
import { Banner, Button, Card, Disclaimer, ErrorState, Screen, Skeleton, Switch, Text, useToast } from "@/components/ui";
import { readFinderPhoto, type FinderPhoto } from "@/features/colour-finder/photo-pixels";
import { colourFinderPass } from "@/features/colour-finder/pass";
import { closenessWords, readAt, spotAt, type Spot } from "@/features/colour-finder/sampling";
import { useColourFinder, useVistaMatches } from "@/features/colour-finder/use-colour-finder";
import { usePassPurchase } from "@/features/payments/use-pass-purchase";
import { passEnds } from "@/features/shade-book/book";
import { CatalogueSwitch } from "@/features/shade-book/CatalogueSwitch";
import { PassNoticeBanner } from "@/features/shade-book/components";
import { t } from "@/i18n";
import { extractPalette } from "@/lib/palette";
import { MIXED_BELOW } from "@/lib/surface-sample";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

/** The most of the screen's height the photo takes, so the shades it finds stay in reach. */
const PHOTO_SHARE = 0.55;

/**
 * C35 · Colour finder. In the Catalogue tab, beside the shades and the Shade Book: the switch at
 * the top of all three, and the tab stays lit.
 *
 * A photo of a colour the customer loves — taken, or chosen from the phone — a tap on it, and
 * the nearest HueVistaa shades by Vista code and colour alone. The photo is read on the phone
 * (photo-pixels.ts), the same way the website reads one, and picking a colour is free; the
 * shades are what the 24-hour pass opens. What is open is the server's answer — this screen
 * only shows it.
 */
export default function ColourFinderScreen() {
  const { colors, space, radius } = useTheme();
  const screen = useWindowDimensions();
  const toast = useToast();
  const finder = useColourFinder();
  const access = finder.data;
  const open = Boolean(access?.open);
  const pass = usePassPurchase(access, colourFinderPass);
  const pull = usePullToRefresh(finder.refetch);
  const [photo, setPhoto] = useState<FinderPhoto | null>(null);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [evenLight, setEvenLight] = useState(true);
  const [spot, setSpot] = useState<Spot | null>(null);
  /** A colour taken from the palette — an average of the whole photo, with no spot behind it. */
  const [swatch, setSwatch] = useState<string | null>(null);
  // The colour picked is read off the spot tapped, as the photo is or with its lighting evened
  // out — so the switch re-reads that spot rather than losing it: comparing the two readings is
  // the reason to have the switch.
  const picked = useMemo(
    () => (photo && spot ? readAt(photo, spot, evenLight) : swatch ? { hex: swatch, uniformity: 1 } : null),
    [photo, spot, swatch, evenLight],
  );
  const matches = useVistaMatches(picked?.hex ?? null, open);

  const palette = useMemo(
    () => (photo ? extractPalette(evenLight ? photo.even : photo.pixels.data, 8) : []),
    [photo, evenLight],
  );

  const load = async (asset: ImagePicker.ImagePickerAsset | null | undefined) => {
    if (!asset) return;
    setReading(true);
    setProblem(null);
    try {
      setPhoto(await readFinderPhoto(asset.uri, asset.width, asset.height));
      setSpot(null);
      setSwatch(null);
    } catch {
      setProblem(t("colourFinder.unreadable"));
    } finally {
      setReading(false);
    }
  };

  const choose = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, exif: false });
      await load(result.canceled ? null : result.assets?.[0]);
    } catch {
      setProblem(t("colourFinder.unreadable"));
    }
  };

  const take = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setProblem(t("colourFinder.cameraDenied"));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: false });
      await load(result.canceled ? null : result.assets?.[0]);
    } catch {
      setProblem(t("colourFinder.unreadable"));
    }
  };

  // As wide as the screen, up to its share of the height — the photo's own shape either way.
  const maxWidth = screen.width - space.gutter * 2;
  const aspect = photo ? photo.pixels.width / photo.pixels.height : 1;
  const shownHeight = Math.min(maxWidth / aspect, screen.height * PHOTO_SHARE);
  const shown = { width: Math.round(shownHeight * aspect), height: Math.round(shownHeight) };

  const tapped = (e: GestureResponderEvent) => {
    if (!photo) return;
    const at = spotAt(e.nativeEvent.locationX, e.nativeEvent.locationY, shown, photo.pixels);
    if (!at) return;
    setSpot(at);
    setSwatch(null);
  };

  const copy = async (match: VistaShadeMatch) => {
    try {
      await Clipboard.setStringAsync(match.hvCode);
      toast.show(t("colourFinder.copied", { code: match.hvCode }), "success");
    } catch {
      // The code is on screen to read out.
    }
  };

  let results = null;
  if (picked) {
    let answer;
    if (finder.isPending) {
      answer = <Skeleton width="100%" height={56} radius={10} />;
    } else if (!access) {
      answer = <ErrorState error={finder.error} onRetry={() => void finder.refetch()} />;
    } else if (!open || matches.shut) {
      answer = (
        <View style={{ gap: space.sm }} testID="colour-finder-shut">
          <Text variant="bodyStrong">{t("colourFinder.shutTitle")}</Text>
          <Text variant="small" tone="soft">
            {t("colourFinder.shutBody", { hours: access.hours })}
          </Text>
          <BuyButton access={access} price={pass.price} sellable={pass.sellable} busy={pass.busy} onBuy={() => void pass.buy()} />
        </View>
      );
    } else if (matches.isPending) {
      answer = (
        <View style={{ gap: space.xs }} testID="colour-finder-matching">
          <Skeleton width="100%" height={52} radius={10} />
          <Skeleton width="100%" height={52} radius={10} />
        </View>
      );
    } else if (matches.error) {
      answer = (
        <View style={{ gap: space.sm }}>
          <Text variant="small" tone="soft">
            {t("colourFinder.matchFailed")}
          </Text>
          <Button variant="secondary" block={false} label={t("common.retry")} onPress={() => void matches.refetch()} />
        </View>
      );
    } else if (!matches.data?.length) {
      answer = (
        <Text variant="small" tone="soft">
          {t("colourFinder.none")}
        </Text>
      );
    } else {
      answer = (
        <View style={{ gap: space.xs }} testID="colour-finder-matches">
          <Text variant="label" tone="mute">
            {t("colourFinder.nearest")}
          </Text>
          {matches.data.map((match, i) => (
            <MatchRow key={match.hvCode} match={match} closest={i === 0} onPress={() => void copy(match)} />
          ))}
          <Text variant="caption" tone="mute">
            {t("colourFinder.note")}
          </Text>
        </View>
      );
    }
    results = (
      <Card style={{ gap: space.md }} testID="colour-finder-picked">
        <View style={styles.inline}>
          <View style={[styles.bigSwatch, { backgroundColor: picked.hex, borderColor: colors.ruleStrong, borderRadius: radius.sm }]} />
          <View style={{ gap: 2 }}>
            <Text variant="caption" tone="mute">
              {t("colourFinder.picked")}
            </Text>
            <Text variant="bodyStrong">{picked.hex.toUpperCase()}</Text>
          </View>
        </View>
        {picked.uniformity < MIXED_BELOW ? <Banner tone="warning" message={t("colourFinder.mixed")} /> : null}
        {answer}
      </Card>
    );
  }

  return (
    <Screen
      edges={["top"]}
      scroll
      onRefresh={pull.onRefresh}
      refreshing={pull.refreshing}
      contentStyle={{ gap: space.md, paddingTop: space.md, paddingBottom: space.xl }}
    >
      <CatalogueSwitch value="finder" />
      <View style={{ gap: space.xs }}>
        <Text variant="title1" accessibilityRole="header">
          {t("colourFinder.title")}
        </Text>
        <Text variant="small" tone="soft">
          {t("colourFinder.lead")}
        </Text>
      </View>
      {access ? <Standing access={access} price={pass.price} sellable={pass.sellable} busy={pass.busy} onBuy={() => void pass.buy()} /> : null}
      <PassNoticeBanner notice={pass.notice} />
      {problem ? <Banner tone="danger" message={problem} /> : null}

      {photo ? (
        <View style={{ gap: space.sm }}>
          <Pressable
            onPress={tapped}
            accessibilityRole="imagebutton"
            accessibilityLabel={t("colourFinder.photoLabel")}
            testID="colour-finder-photo"
            style={{ width: shown.width, height: shown.height, alignSelf: "center" }}
          >
            <Image source={{ uri: photo.uri }} style={{ width: shown.width, height: shown.height, borderRadius: radius.sm }} contentFit="fill" />
            {spot ? (
              <View
                pointerEvents="none"
                style={[
                  styles.marker,
                  {
                    left: ((spot.x + 0.5) / photo.pixels.width) * shown.width - MARKER / 2,
                    top: ((spot.y + 0.5) / photo.pixels.height) * shown.height - MARKER / 2,
                    borderColor: colors.ivory,
                    backgroundColor: picked?.hex,
                  },
                ]}
              />
            ) : null}
          </Pressable>
          <Text variant="caption" tone="mute" align="center">
            {t("colourFinder.tapHint")}
          </Text>
          <Switch label={t("colourFinder.evenLight")} note={t("colourFinder.evenLightHint")} value={evenLight} onValueChange={setEvenLight} />
          {palette.length > 0 ? (
            <View style={{ gap: space.xs }}>
              <Text variant="label" tone="mute">
                {t("colourFinder.palette")}
              </Text>
              <View style={[styles.palette, { gap: space.xs }]}>
                {palette.map((hex) => (
                  <Pressable
                    key={hex}
                    onPress={() => {
                      setSpot(null);
                      setSwatch(hex);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t("colourFinder.paletteItem", { hex })}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: hex,
                        borderRadius: radius.sm,
                        borderColor: picked?.hex === hex ? colors.fg : colors.ruleStrong,
                        borderWidth: picked?.hex === hex ? 2 : StyleSheet.hairlineWidth,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
          ) : null}
          <View style={[styles.inline, { gap: space.sm }]}>
            <View style={styles.fill}>
              <Button variant="secondary" icon="camera" label={t("colourFinder.takePhoto")} onPress={() => void take()} disabled={reading} />
            </View>
            <View style={styles.fill}>
              <Button variant="secondary" icon="image" label={t("colourFinder.anotherPhoto")} onPress={() => void choose()} loading={reading} />
            </View>
          </View>
        </View>
      ) : (
        <Card style={{ gap: space.sm }} testID="colour-finder-start">
          <Button icon="camera" label={t("colourFinder.takePhoto")} onPress={() => void take()} disabled={reading} />
          <Button variant="secondary" icon="image" label={t("colourFinder.choosePhoto")} onPress={() => void choose()} loading={reading} />
          {reading ? (
            <Text variant="caption" tone="mute" align="center">
              {t("colourFinder.reading")}
            </Text>
          ) : null}
        </Card>
      )}

      {results}
      <Disclaimer kind="shades" />
    </Screen>
  );
}

const MARKER = 26;

/** Where the customer stands: the pass and when it ends, the team's open finder, or the offer. */
function Standing({
  access,
  price,
  sellable,
  busy,
  onBuy,
}: {
  access: ColourFinderAccess;
  price: string | null;
  sellable: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  if (access.reason === "ADMIN") return <Banner tone="info" message={t("colourFinder.adminOpen")} />;
  if (access.open) {
    const ends = passEnds(access.expiresAt);
    return (
      <Banner
        tone="success"
        title={ends ? t("colourFinder.openUntil", { time: ends }) : t("colourFinder.openedPlain")}
        message={t("colourFinder.openBody")}
      />
    );
  }
  return (
    <Banner tone="info" message={t("colourFinder.standingShut", { hours: access.hours })}>
      <BuyButton access={access} price={price} sellable={sellable} busy={busy} onBuy={onBuy} />
    </Banner>
  );
}

/** Buy the pass — or say plainly that it can't be bought here. */
function BuyButton({
  access,
  price,
  sellable,
  busy,
  onBuy,
}: {
  access: ColourFinderAccess;
  price: string | null;
  sellable: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  if (!sellable) {
    return (
      <Text variant="small" tone="mute">
        {t("colourFinder.notSold")}
      </Text>
    );
  }
  const label = price
    ? t("colourFinder.buy", { hours: access.hours, price })
    : t("colourFinder.buyNoPrice", { hours: access.hours });
  return <Button label={label} onPress={onBuy} loading={busy} testID="colour-finder-buy" />;
}

/** One shade found: its colour, its colour in words, its Vista code and how close it is. A tap copies the code. */
function MatchRow({ match, closest, onPress }: { match: VistaShadeMatch; closest: boolean; onPress: () => void }) {
  const { colors, radius, space } = useTheme();
  const rating = closenessWords(match.deltaE);
  const name = match.colourName || match.hvCode;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("colourFinder.matchLabel", { name, code: match.hvCode, rating })}
      style={({ pressed }) => [
        styles.row,
        {
          gap: space.sm,
          padding: space.sm,
          borderRadius: radius.sm,
          borderWidth: closest ? 1.5 : StyleSheet.hairlineWidth,
          borderColor: closest ? colors.accentText : colors.rule,
          backgroundColor: pressed ? colors.surfaceSoft : "transparent",
        },
      ]}
    >
      <View style={[styles.swatch, { backgroundColor: match.hexCode, borderColor: colors.ruleStrong, borderRadius: radius.sm }]} />
      <View style={styles.fill}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" tone="mute">
          {rating}
        </Text>
      </View>
      <Text variant="code" style={styles.code}>
        {match.hvCode}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  inline: { flexDirection: "row", alignItems: "center", gap: 12 },
  row: { flexDirection: "row", alignItems: "center" },
  palette: { flexDirection: "row", flexWrap: "wrap" },
  chip: { width: 40, height: 40 },
  swatch: { width: 40, height: 40, borderWidth: StyleSheet.hairlineWidth },
  bigSwatch: { width: 52, height: 52, borderWidth: StyleSheet.hairlineWidth },
  code: { fontSize: 16, lineHeight: 20 },
  marker: { position: "absolute", width: MARKER, height: MARKER, borderRadius: MARKER / 2, borderWidth: 3 },
});
