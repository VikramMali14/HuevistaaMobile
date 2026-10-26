import Feather from "@expo/vector-icons/Feather";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Linking, ScrollView, StyleSheet, View } from "react-native";

import { nearbyApi, type NearbyPlace } from "@/api/endpoints/nearby";
import { messageFor } from "@/api/errors";
import { Banner, Button, Card, Chip, ErrorState, Screen, Segmented, Skeleton, Text, TextField } from "@/components/ui";
import { alreadyAllowed, locate, type Located } from "@/features/nearby/locate";
import {
  DEFAULT_RADIUS_KM,
  MAX_RESULTS,
  RADII_KM,
  placeLabel,
  searchPoint,
  widerRadius,
  type RadiusKm,
  type SearchPoint,
} from "@/features/nearby/nearby";
import { PainterCard, ShopCard } from "@/features/nearby/NearbyCards";
import { useNearbyPainters, useNearbyShops } from "@/features/nearby/use-nearby";
import { t } from "@/i18n";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

type Tab = "painters" | "shops";

/**
 * C32 · Painters and shops near you. Spec: docs/04-screens-customer.md — C32. Web
 * reference: HueVistaFrontEnd components/app/nearby-finder.tsx, lib/nearby.ts.
 *
 * Painters / Shops, a distance, and who is listed within it, nearest first. Where the
 * phone is gets asked only on a press — or straight away when the customer already said
 * yes — and is used for the search alone: it lives in this screen and the in-memory cache,
 * never written down, and leaves the phone rounded to about 100 m. Both lists are read for
 * each point and distance (the tabs show both counts), and kept five minutes: they share
 * a small hourly allowance. A painter's number is asked for only when Call is pressed.
 *
 * Or a city, area or PIN code typed instead (GET /api/nearby/places) — for someone who
 * won't share where the phone is, or is finding a painter for a house they aren't in. The
 * likeliest place is searched at once and any others of that name are offered beside it.
 *
 * A tab of its own (it was a card on Home), so it has no back button. A shade's "Find a
 * shop near you" still opens it at /nearby?tab=shops.
 */
export default function Nearby() {
  const { space, colors } = useTheme();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "shops" ? "shops" : "painters");
  // The tab can already be up when a link asks for one of its lists, so follow ?tab= as it changes.
  const [seenTabParam, setSeenTabParam] = useState(params.tab);
  if (params.tab !== seenTabParam) {
    setSeenTabParam(params.tab);
    if (params.tab === "shops" || params.tab === "painters") setTab(params.tab);
  }
  const [radius, setRadius] = useState<RadiusKm>(DEFAULT_RADIUS_KM);
  const [point, setPoint] = useState<SearchPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<Exclude<Located, { kind: "fix" }> | null>(null);
  const [query, setQuery] = useState("");
  const [finding, setFinding] = useState(false);
  const [placeProblem, setPlaceProblem] = useState<string | null>(null);
  /** The typed place being searched near — null when the point is the phone's own. */
  const [place, setPlace] = useState<NearbyPlace | null>(null);
  /** Every place the last typed name could mean, `place` among them. */
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const live = useRef(true);
  // Set once a typed place is searched, so the fix the screen goes for by itself on arrival
  // — which can land seconds later — neither replaces it nor reports its failure.
  const placeChosen = useRef(false);
  const painters = useNearbyPainters(point, radius);
  const shops = useNearbyShops(point, radius);
  const pull = usePullToRefresh(async () => {
    if (point) await Promise.all([painters.refetch(), shops.refetch()]);
  });

  /** `onArrival`: the search the screen starts by itself, which gives way to a place typed meanwhile. */
  const find = async (onArrival = false) => {
    setLocating(true);
    setProblem(null);
    const where = await locate();
    if (!live.current) return;
    setLocating(false);
    if (onArrival && placeChosen.current) return;
    if (where.kind === "fix") {
      setPoint(where.point);
      setPlace(null);
      setPlaces([]);
    } else setProblem(where);
  };

  const searchNear = (chosen: NearbyPlace) => {
    const at = searchPoint(chosen.latitude, chosen.longitude);
    if (!at) return;
    placeChosen.current = true;
    setPoint(at);
    setPlace(chosen);
    setProblem(null);
  };

  const findPlace = async () => {
    const typed = query.trim();
    Keyboard.dismiss();
    if (!typed) {
      setPlaceProblem(t("nearby.placeEmpty"));
      return;
    }
    setFinding(true);
    setPlaceProblem(null);
    try {
      const found = await nearbyApi.places(typed);
      if (!live.current) return;
      setPlaces(found);
      if (found.length > 0) searchNear(found[0]!);
      else setPlaceProblem(/^[\d\s\u0966-\u096F]+$/.test(typed) ? t("nearby.pinNotFound", { pin: typed }) : t("nearby.placeNotFound", { place: typed }));
    } catch (err) {
      if (!live.current) return;
      setPlaces([]);
      setPlaceProblem(messageFor(err, t("nearby.placeFailed")));
    } finally {
      if (live.current) setFinding(false);
    }
  };

  // A customer who already let HueVistaa use the location needn't be asked to press for it.
  useEffect(() => {
    live.current = true;
    void alreadyAllowed().then((yes) => {
      if (yes && live.current) void find(true);
    });
    return () => {
      live.current = false;
    };
  }, []);

  const list = tab === "painters" ? painters : shops;
  const count = (q: typeof painters | typeof shops) => (point && q.data ? q.data.length : null);
  const paintersCount = count(painters);
  const shopsCount = count(shops);
  const wider = widerRadius(radius);
  const otherPlaces = place ? places.filter((p) => p !== place) : [];

  let body: React.ReactNode;
  if (!point) {
    body = (
      <Card>
        <View style={{ gap: space.sm }} testID="nearby-ask">
          <Feather name="map-pin" size={26} color={colors.accentText} />
          <Text variant="title3">{tab === "painters" ? t("nearby.findPainter") : t("nearby.findShop")}</Text>
          <Text variant="body" tone="soft">
            {t("nearby.why")}
          </Text>
          {problem ? (
            <Banner tone="warning" message={problemMessage(problem)} testID="nearby-problem">
              {problem.kind === "denied" && problem.settings ? (
                <Button variant="ghost" block={false} label={t("nearby.openSettings")} onPress={() => void Linking.openSettings()} />
              ) : null}
            </Banner>
          ) : null}
          {problem?.kind === "denied" && problem.settings ? null : (
            <Button icon="crosshair" label={locating ? t("nearby.finding") : t("nearby.useLocation")} loading={locating} onPress={() => void find()} testID="nearby-locate" />
          )}
        </View>
      </Card>
    );
  } else if (list.isPending) {
    body = (
      <View style={{ gap: space.sm }} testID="nearby-loading" accessibilityLiveRegion="polite">
        <Text variant="small" tone="mute">
          {t("nearby.looking", { km: radius })}
        </Text>
        <Skeleton height={150} radius={16} />
        <Skeleton height={150} radius={16} />
      </View>
    );
  } else if (list.isError && !list.data) {
    body = <ErrorState message={messageFor(list.error, t("nearby.loadFailed"))} onRetry={() => void list.refetch()} />;
  } else if (!list.data?.length) {
    body = (
      <View style={{ gap: space.sm, paddingVertical: space.md }} testID="nearby-empty">
        <Text variant="title3">{tab === "painters" ? t("nearby.noPainters", { km: radius }) : t("nearby.noShops", { km: radius })}</Text>
        <Text variant="body" tone="soft">
          {tab === "painters" ? t("nearby.noPaintersBody") : t("nearby.noShopsBody")}
          {wider ? ` ${t("nearby.tryWider")}` : ""}
        </Text>
        {wider ? <Button variant="secondary" label={t("nearby.searchFurther")} onPress={() => setRadius(wider)} testID="nearby-further" /> : null}
      </View>
    );
  } else {
    body = (
      <View style={{ gap: space.sm }} testID={`nearby-${tab}`}>
        {tab === "painters"
          ? painters.data?.map((p) => <PainterCard key={p.id} painter={p} />)
          : shops.data?.map((s) => <ShopCard key={s.id} shop={s} />)}
        {list.data.length >= MAX_RESULTS ? (
          <Text variant="small" tone="mute">
            {t("nearby.nearest50")}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Screen scroll edges={["top"]} onRefresh={point ? pull.onRefresh : undefined} refreshing={pull.refreshing} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <View style={{ gap: space.xs, marginTop: space.md }}>
        <Text variant="label" tone="accent">
          {t("nearby.eyebrow")}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {t("nearby.title")}
        </Text>
        <Text variant="lead">{t("nearby.lead")}</Text>
      </View>

      <Segmented
        accessibilityLabel={t("nearby.show")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "painters", label: paintersCount === null ? t("nearby.painters") : t("nearby.paintersN", { n: paintersCount }) },
          { value: "shops", label: shopsCount === null ? t("nearby.shops") : t("nearby.shopsN", { n: shopsCount }) },
        ]}
      />

      <View style={{ gap: space.sm }}>
        <View style={[styles.row, styles.bottom, { gap: space.sm }]}>
          <View style={styles.fill}>
            <TextField
              label={t("nearby.placeField")}
              placeholder={t("nearby.placePlaceholder")}
              value={query}
              onChangeText={(next) => {
                setQuery(next);
                setPlaceProblem(null);
              }}
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="search"
              maxLength={80}
              onSubmitEditing={() => void findPlace()}
              testID="nearby-place"
            />
          </View>
          <Button variant="secondary" block={false} label={t("nearby.placeSearch")} loading={finding} onPress={() => void findPlace()} testID="nearby-place-search" />
        </View>
        {placeProblem ? <Banner tone="warning" message={placeProblem} testID="nearby-place-problem" /> : null}
        {place ? (
          <View style={{ gap: space.xs }} accessibilityLiveRegion="polite" testID="nearby-near">
            <Text variant="body" tone="soft">
              {t("nearby.near", { place: placeLabel(place) })}
            </Text>
            {otherPlaces.length > 0 ? (
              <View style={[styles.row, styles.wrap, { gap: space.xs }]}>
                <Text variant="small" tone="mute">
                  {t("nearby.didYouMean")}
                </Text>
                {otherPlaces.map((p, i) => (
                  <Chip key={`${p.name}|${p.region}|${p.latitude},${p.longitude}`} label={placeLabel(p)} selected={false} onPress={() => searchNear(p)} testID={`nearby-other-${i}`} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={{ gap: space.xs }}>
        <View style={[styles.row, { gap: space.sm }]}>
          <Text variant="fieldLabel" style={styles.fill}>
            {t("nearby.within")}
          </Text>
          {point ? (
            <Button
              variant="ghost"
              block={false}
              icon="crosshair"
              label={locating ? t("nearby.finding") : place ? t("nearby.useLocation") : t("nearby.updateLocation")}
              loading={locating}
              onPress={() => void find()}
              testID="nearby-relocate"
            />
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }} accessibilityRole="radiogroup">
          {RADII_KM.map((km) => (
            <Chip key={km} role="radio" label={t("nearby.radius", { km })} selected={km === radius} onPress={() => setRadius(km)} testID={`radius-${km}`} />
          ))}
        </ScrollView>
        {point && problem ? <Banner tone="warning" message={problemMessage(problem)} testID="nearby-problem" /> : null}
      </View>

      {body}

      {place ? (
        // India Post's directory is published under the Government Open Data License and
        // GeoNames under CC BY 4.0; both ask to be credited where their data is used.
        <Text variant="caption" tone="mute" testID="nearby-place-credit">
          {t("nearby.placeCredit")}
        </Text>
      ) : null}
    </Screen>
  );
}

function problemMessage(problem: Exclude<Located, { kind: "fix" }>): string {
  switch (problem.kind) {
    case "denied":
      return problem.settings ? t("nearby.deniedSettings") : t("nearby.denied");
    case "off":
      return t("nearby.off");
    default:
      return t("nearby.failed");
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  // The Search button level with the box, under the field's label.
  bottom: { alignItems: "flex-end" },
  wrap: { flexWrap: "wrap" },
  fill: { flex: 1 },
});
