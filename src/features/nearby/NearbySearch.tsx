import Feather from "@expo/vector-icons/Feather";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";

import { nearbyApi, type NearbyPlace, type WorkAreaState } from "@/api/endpoints/nearby";
import { messageFor } from "@/api/errors";
import { BackButton, Banner, Button, Card, Chip, ErrorState, ListGroup, ListRow, Screen, Sheet, Skeleton, Text, TextField } from "@/components/ui";
import { MAX_RESULTS, SEARCH_RADIUS_KM, inState, placeLabel, searchPoint, type SearchPoint } from "@/features/nearby/nearby";
import { PainterCard, ShopCard } from "@/features/nearby/NearbyCards";
import { useNearbyPainters, useNearbyShops, useWorkAreas } from "@/features/nearby/use-nearby";
import { placeName } from "@/features/nearby/work-areas";
import { t } from "@/i18n";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { hairline, minTouch, useTheme } from "@/theme";

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
 * closest is at the top however far it is. Only this screen's list is read for each point, and
 * kept five minutes: the lists share a small hourly allowance. A painter's number is asked for
 * only when Call is pressed, and each card says where the painter can go for a job. Painters
 * further off who said they work in the place the search is from come after, marked "Works in
 * your area".
 *
 * Asked the way a paint company's dealer locator asks it, as on the website: the state first,
 * from a list (the work-areas catalogue, GET /api/nearby/work-areas), then the city, area or
 * PIN code in it (GET /api/nearby/places, asked as "place, State"). The phone's location is not
 * asked for. Only places in the chosen state are searched; a name found only in another state is
 * offered, and choosing it moves the state to match. The likeliest place in the state is
 * searched at once and any others of that name there are offered beside it. Should the list of
 * states not load, the place box works on its own.
 *
 * `back`: the shops screen is pushed over the tabs, so it has a way back; the Painters tab
 * has none.
 */
export function NearbySearch({ kind, back = false }: { kind: NearbyKind; back?: boolean }) {
  const { space, colors, radius } = useTheme();
  const tab = kind;
  const [point, setPoint] = useState<SearchPoint | null>(null);
  /** The chosen state's work-areas code; null until one is chosen. */
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [choosingState, setChoosingState] = useState(false);
  const [query, setQuery] = useState("");
  const [finding, setFinding] = useState(false);
  const [placeProblem, setPlaceProblem] = useState<string | null>(null);
  /** The typed place being searched near. */
  const [place, setPlace] = useState<NearbyPlace | null>(null);
  /** Every place in the state the last typed name could mean, `place` among them. */
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  /** Places of that name found only in other states: offered, never searched on their own. */
  const [elsewhere, setElsewhere] = useState<NearbyPlace[]>([]);
  const live = useRef(true);
  const workAreas = useWorkAreas();
  const states: WorkAreaState[] = workAreas.data?.states ?? [];
  const state = states.find((s) => s.code === stateCode) ?? null;
  // Without the list (it failed to load) the box works on its own, as a search of all India.
  const needsState = !(workAreas.isError && !workAreas.data);
  // Only this screen's list is asked for.
  const painters = useNearbyPainters(kind === "painters" ? point : null, SEARCH_RADIUS_KM);
  const shops = useNearbyShops(kind === "shops" ? point : null, SEARCH_RADIUS_KM);
  const pull = usePullToRefresh(async () => {
    if (point) await (kind === "painters" ? painters.refetch() : shops.refetch());
  });

  const searchNear = (chosen: NearbyPlace) => {
    const at = searchPoint(chosen.latitude, chosen.longitude);
    if (!at) return;
    setPoint(at);
    setPlace(chosen);
  };

  const chooseState = (code: string) => {
    setChoosingState(false);
    if (code === stateCode) return;
    setStateCode(code);
    // A new state is a new search: what was found in the last one no longer answers it.
    setPoint(null);
    setPlace(null);
    setPlaces([]);
    setElsewhere([]);
    setPlaceProblem(null);
  };

  /** A place offered from another state: choosing it moves the state to it as well. */
  const goElsewhere = (chosen: NearbyPlace) => {
    const its = states.find((s) => inState(chosen, s));
    if (its) setStateCode(its.code);
    setPlaces([chosen]);
    setElsewhere([]);
    setPlaceProblem(null);
    searchNear(chosen);
  };

  const findPlace = async () => {
    const typed = query.trim();
    Keyboard.dismiss();
    if (needsState && !state) {
      setPlaceProblem(t("nearby.stateFirst"));
      return;
    }
    if (!typed) {
      setPlaceProblem(state ? t("nearby.placeEmptyIn", { state: placeName(state) }) : t("nearby.placeEmpty"));
      return;
    }
    const isPin = /^[\d\s\u0966-\u096F]+$/.test(typed);
    setFinding(true);
    setPlaceProblem(null);
    try {
      // "Kothrud, Maharashtra": the server narrows a name by what follows the comma. A PIN is
      // already one place, and is asked for alone.
      const found = await nearbyApi.places(state && !isPin && !typed.includes(",") ? `${typed}, ${state.name}` : typed);
      if (!live.current) return;
      const ours = state ? found.filter((p) => inState(p, state)) : found;
      setPlaces(ours);
      setElsewhere(state ? found.filter((p) => !inState(p, state)) : []);
      if (ours.length > 0) searchNear(ours[0]!);
      else {
        setPoint(null);
        setPlace(null);
        const where = state ? placeName(state) : "";
        setPlaceProblem(
          found.length > 0 && state
            ? isPin
              ? t("nearby.pinElsewhere", { pin: typed, state: where })
              : t("nearby.placeNotIn", { place: typed, state: where })
            : isPin
              ? t("nearby.pinNotFound", { pin: typed })
              : state
                ? t("nearby.placeNotIn", { place: typed, state: where })
                : t("nearby.placeNotFound", { place: typed }),
        );
      }
    } catch (err) {
      if (!live.current) return;
      setPlaces([]);
      setElsewhere([]);
      setPlaceProblem(messageFor(err, t("nearby.placeFailed")));
    } finally {
      if (live.current) setFinding(false);
    }
  };

  useEffect(() => {
    live.current = true;
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
            {needsState ? t("nearby.why") : t("nearby.whyPlaceOnly")}
          </Text>
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
        {needsState ? (
          <View style={{ gap: 8 }}>
            <Text variant="fieldLabel">{t("nearby.stateField")}</Text>
            <Pressable
              onPress={() => setChoosingState(true)}
              disabled={!workAreas.data}
              accessibilityRole="button"
              accessibilityLabel={`${t("nearby.stateField")}: ${state ? placeName(state) : t("nearby.stateChoose")}`}
              style={({ pressed }) => [
                styles.select,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.ruleStrong,
                  borderRadius: radius.md,
                  opacity: workAreas.data ? (pressed ? 0.8 : 1) : 0.55,
                },
              ]}
              testID="nearby-state"
            >
              <Text variant="body" tone={state ? undefined : "mute"} style={styles.fill}>
                {state ? placeName(state) : workAreas.data ? t("nearby.stateChoose") : t("nearby.stateLoading")}
              </Text>
              <Feather name="chevron-down" size={20} color={colors.fgMute} />
            </Pressable>
          </View>
        ) : null}
        <View style={[styles.row, styles.bottom, { gap: space.sm }]}>
          <View style={styles.fill}>
            <TextField
              label={t("nearby.placeField")}
              placeholder={state ? t("nearby.placePlaceholderIn", { state: placeName(state) }) : needsState ? t("nearby.stateFirst") : t("nearby.placePlaceholder")}
              editable={!needsState || state !== null}
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
          <Button
            variant="secondary"
            block={false}
            label={t("nearby.placeSearch")}
            loading={finding}
            disabled={needsState && !state}
            onPress={() => void findPlace()}
            testID="nearby-place-search"
          />
        </View>
        {placeProblem ? <Banner tone="warning" message={placeProblem} testID="nearby-place-problem" /> : null}
        {!place && elsewhere.length > 0 ? (
          <View style={[styles.row, styles.wrap, { gap: space.xs }]} testID="nearby-elsewhere">
            <Text variant="small" tone="mute">
              {t("nearby.otherState")}
            </Text>
            {elsewhere.map((p, i) => (
              <Chip key={`${p.name}|${p.region}|${p.latitude},${p.longitude}`} label={placeLabel(p)} selected={false} onPress={() => goElsewhere(p)} testID={`nearby-elsewhere-${i}`} />
            ))}
          </View>
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

      <Text variant="fieldLabel" testID="nearby-within">
        {t("nearby.withinFixed", { km: SEARCH_RADIUS_KM })}
      </Text>

      {body}

      {place ? (
        // India Post's directory is published under the Government Open Data License and
        // GeoNames under CC BY 4.0; both ask to be credited where their data is used.
        <Text variant="caption" tone="mute" testID="nearby-place-credit">
          {t("nearby.placeCredit")}
        </Text>
      ) : null}

      <Sheet visible={choosingState} onClose={() => setChoosingState(false)} title={t("nearby.stateSheet")} testID="nearby-state-sheet">
        <ListGroup>
          {states.map((s) => (
            <ListRow
              key={s.code}
              title={placeName(s)}
              value={s.code === stateCode ? t("nearby.stateChosen") : undefined}
              onPress={() => chooseState(s.code)}
              testID={`nearby-state-${s.code}`}
            />
          ))}
        </ListGroup>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  // The Search button level with the box, under the field's label.
  bottom: { alignItems: "flex-end" },
  wrap: { flexWrap: "wrap" },
  fill: { flex: 1 },
  // A box like TextField's, that opens the list of states.
  select: { minHeight: 52, minWidth: minTouch, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: hairline, paddingHorizontal: 14 },
});
