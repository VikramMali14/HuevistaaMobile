import Feather from "@expo/vector-icons/Feather";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Linking, StyleSheet, View } from "react-native";

import { nearbyApi, type NearbyPlace } from "@/api/endpoints/nearby";
import { messageFor } from "@/api/errors";
import { BackButton, Banner, Button, Card, Chip, ErrorState, Screen, Skeleton, Text, TextField } from "@/components/ui";
import { alreadyAllowed, locate, type Located } from "@/features/nearby/locate";
import { MAX_RESULTS, SEARCH_RADIUS_KM, placeLabel, searchPoint, type SearchPoint } from "@/features/nearby/nearby";
import { PainterCard, ShopCard } from "@/features/nearby/NearbyCards";
import { useNearbyPainters, useNearbyShops, useWhere } from "@/features/nearby/use-nearby";
import { t } from "@/i18n";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

export type NearbyKind = "painters" | "shops";

/**
 * Painters near you (C32), or paint shops near you (C36) — one list on one screen, never
 * both behind a switch. Spec: docs/04-screens-customer.md — C32 and C36. Web reference:
 * HueVistaFrontEnd components/app/nearby-finder.tsx (its `only` mode), lib/nearby.ts.
 *
 * Who will paint it and where to buy the paint are two different jobs, so a customer meets
 * them as two places: "Find a painter" is the Painters tab, and "Find a paint shop" is a
 * screen of its own, opened from its tile on Home, from Account, and from a shade's
 * "Find a shop near you".
 *
 * Who is listed within 50 km, nearest first — no distance to pick, as on the website: the
 * closest is at the top however far it is. Where the phone is gets asked only on a press —
 * or straight away when the customer already said yes — and is used for the search alone:
 * it lives in this screen and the in-memory cache, never written down, and leaves the phone
 * rounded to about 100 m. Only this screen's list is read for each point, and kept five
 * minutes: the lists share a small hourly allowance. A painter's number is asked for only
 * when Call is pressed, and each card says where the painter can go for a job. Painters
 * further off who said they work in the place the search is from come after, marked
 * "Works in your area"; the phone's own point is named ("Near …", GET /api/nearby/where,
 * asked to about a kilometre) as a typed place is.
 *
 * Or a city, area or PIN code typed instead (GET /api/nearby/places) — for someone who
 * won't share where the phone is, or is finding a painter for a house they aren't in. The
 * likeliest place is searched at once and any others of that name are offered beside it.
 *
 * `back`: the shops screen is pushed over the tabs, so it has a way back; the Painters tab
 * has none.
 */
export function NearbySearch({ kind, back = false }: { kind: NearbyKind; back?: boolean }) {
  const { space, colors } = useTheme();
  const tab = kind;
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
  // Only this screen's list is asked for.
  const painters = useNearbyPainters(kind === "painters" ? point : null, SEARCH_RADIUS_KM);
  const shops = useNearbyShops(kind === "shops" ? point : null, SEARCH_RADIUS_KM);
  // The phone's own point, named as a typed place is: "Near Kaiser Ganj Ajmer, Ajmer, Rajasthan".
  const here = useWhere(point && !place ? point : null);
  const pull = usePullToRefresh(async () => {
    if (point) await (kind === "painters" ? painters.refetch() : shops.refetch());
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
  const otherPlaces = place ? places.filter((p) => p !== place) : [];

  let body: React.ReactNode;
  if (!point) {
    body = (
      <Card>
        <View style={{ gap: space.sm }} testID="nearby-ask">
          {/* The same picture as its tile on Home: the pin for painters, the bag for shops. */}
          <Feather name={kind === "painters" ? "map-pin" : "shopping-bag"} size={26} color={colors.accentText} />
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
          {t("nearby.looking", { km: SEARCH_RADIUS_KM })}
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
        <Text variant="title3">
          {tab === "painters" ? t("nearby.noPainters", { km: SEARCH_RADIUS_KM }) : t("nearby.noShops", { km: SEARCH_RADIUS_KM })}
        </Text>
        <Text variant="body" tone="soft">
          {tab === "painters" ? t("nearby.noPaintersBody") : t("nearby.noShopsBody")}
        </Text>
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
    <Screen
      scroll
      edges={back ? undefined : ["top"]}
      onRefresh={point ? pull.onRefresh : undefined}
      refreshing={pull.refreshing}
      contentStyle={{ gap: space.lg, paddingBottom: space.xl }}
    >
      {back ? <BackButton fallback="/home" /> : null}
      <View style={{ gap: space.xs, marginTop: back ? 0 : space.md }}>
        <Text variant="label" tone="accent">
          {t("nearby.eyebrow")}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {kind === "painters" ? t("nearby.paintersTitle") : t("nearby.shopsTitle")}
        </Text>
        <Text variant="lead">{kind === "painters" ? t("nearby.paintersLead") : t("nearby.shopsLead")}</Text>
      </View>

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
        {!place && point && here.data?.name ? (
          <Text variant="body" tone="soft" accessibilityLiveRegion="polite" testID="nearby-here">
            {t("nearby.near", { place: here.data.name })}
          </Text>
        ) : null}
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
          <Text variant="fieldLabel" style={styles.fill} testID="nearby-within">
            {t("nearby.withinFixed", { km: SEARCH_RADIUS_KM })}
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
