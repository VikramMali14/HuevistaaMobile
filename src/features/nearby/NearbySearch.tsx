import Feather from "@expo/vector-icons/Feather";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";

import { nearbyApi, type NearbyPlace, type NearbySearch as Scope, type WorkAreaState } from "@/api/endpoints/nearby";
import { messageFor } from "@/api/errors";
import { BackButton, Banner, Button, Card, ErrorState, ListGroup, ListRow, Pill, Screen, Sheet, Skeleton, Text, TextField } from "@/components/ui";
import { placeLabel } from "@/features/nearby/nearby";
import { PainterCard, ShopCard } from "@/features/nearby/NearbyCards";
import { useNearbyPainters, useNearbyShops, useWorkAreas } from "@/features/nearby/use-nearby";
import { divisionTowns, openStates, placeName } from "@/features/nearby/work-areas";
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
 * Asked the way a paint company's dealer locator asks it, as on the website, in two boxes that
 * each open a list: **the state first**, then **one of its divisions** — Rajasthan, then Ajmer,
 * Bharatpur, Bikaner, Jaipur, Jodhpur, Kota or Udaipur, each with the big towns in it under its
 * name, so a customer from Bhilwara knows to pick Ajmer. Choosing the state searches all of it at
 * once (`?state=`); a division narrows it (`?state=&division=`). Nothing is typed and the phone's
 * location is never asked for. No distance either way: those based there come first, then those
 * further off who said they work in (or serve) it, marked "Works in your area". Nobody listed
 * there yet is "Coming soon".
 *
 * Or the customer types their **PIN code** in the box under them: it is looked up
 * (GET /api/nearby/places, which says the PIN's state and division, so the two boxes follow it) and
 * searched near — `?state=&lat=&lon=`, everybody based in its district or close to it, nearest
 * first, then those further off who work in its division. Choosing a state or a division again
 * leaves the PIN for that search. A PIN outside the states HueVistaa is open in is not found, and
 * the customer is told so; India Post, whose PIN codes these are, is credited under the list.
 *
 * The states and divisions are the work-areas catalogue's (GET /api/nearby/work-areas): only the
 * states HueVistaa is open in — Rajasthan at launch — the same places a painter and a shop chose
 * from. Only this screen's list is read for each search, and kept five minutes: the lists share a
 * small hourly allowance. A painter's number is asked for only when Call is pressed.
 *
 * `back`: the shops screen is pushed over the tabs, so it has a way back; the Painters tab
 * has none.
 */
export function NearbySearch({ kind, back = false }: { kind: NearbyKind; back?: boolean }) {
  const { space, colors } = useTheme();
  const tab = kind;
  /** The chosen state's work-areas code; null until one is chosen. */
  const [stateCode, setStateCode] = useState<string | null>(null);
  /** The chosen division's code; null for all of the state. */
  const [divisionCode, setDivisionCode] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<"state" | "division" | null>(null);
  /** What is typed in the PIN code box. */
  const [pinText, setPinText] = useState("");
  /** The PIN code being searched near, once found; null for a search by state and division. */
  const [pin, setPin] = useState<NearbyPlace | null>(null);
  const [findingPin, setFindingPin] = useState(false);
  const [pinProblem, setPinProblem] = useState<string | null>(null);
  const live = useRef(true);
  const workAreas = useWorkAreas();
  const states: WorkAreaState[] = workAreas.data?.states ?? [];
  const state = states.find((s) => s.code === stateCode) ?? null;
  const division = state?.divisions.find((d) => d.code === divisionCode) ?? null;
  // A PIN code found is searched near. Otherwise a state chosen is searched at once, all of it,
  // with no distance limit, and a division narrows it.
  const scope: Scope | null = pin?.state
    ? { state: pin.state, lat: pin.latitude, lon: pin.longitude }
    : state
      ? { state: state.code, ...(division ? { division: division.code } : {}) }
      : null;
  // Only this screen's list is asked for.
  const painters = useNearbyPainters(kind === "painters" ? scope : null);
  const shops = useNearbyShops(kind === "shops" ? scope : null);
  const pull = usePullToRefresh(async () => {
    if (scope) await (kind === "painters" ? painters.refetch() : shops.refetch());
  });

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  /** A state or a division chosen is a search by them: the PIN code is left. */
  const leavePin = () => {
    setPin(null);
    setPinText("");
    setPinProblem(null);
  };

  const chooseState = (code: string) => {
    setChoosing(null);
    if (code === stateCode && !pin) return;
    leavePin();
    setStateCode(code);
    // A new state is a new search: the last one's division no longer answers it.
    setDivisionCode(null);
  };

  const chooseDivision = (code: string | null) => {
    setChoosing(null);
    leavePin();
    setDivisionCode(code);
  };

  /** A PIN code typed: looked up, then searched near — and the boxes above follow it to its state and division. */
  const findPin = async () => {
    Keyboard.dismiss();
    const typed = westernDigits(pinText).replace(/\s+/g, "");
    if (!/^[1-9]\d{5}$/.test(typed)) {
      setPinProblem(t("nearby.pinInvalid"));
      return;
    }
    setFindingPin(true);
    setPinProblem(null);
    try {
      // Only places in the states HueVistaa is open in come back, each with its state.
      const found = (await nearbyApi.places(typed)).find((p) => p.state) ?? null;
      if (!live.current) return;
      if (!found?.state) {
        const open = workAreas.data ? openStates(workAreas.data) : null;
        setPinProblem(open ? t("nearby.pinNotFoundIn", { pin: typed, states: open }) : t("nearby.pinNotFound", { pin: typed }));
        return;
      }
      setStateCode(found.state);
      setDivisionCode(found.division ?? null);
      setPin(found);
    } catch (err) {
      if (live.current) setPinProblem(messageFor(err, t("nearby.pinFailed")));
    } finally {
      if (live.current) setFindingPin(false);
    }
  };

  const list = tab === "painters" ? painters : shops;
  /** The place a "Coming soon" names: the PIN's town, the division, or the state. */
  const where = pin ? pinTown(pin) : division ? placeName(division) : state ? placeName(state) : null;
  /** In a division, or near a PIN, the state it is in, for a "Coming soon" to offer instead. */
  const wider = (pin || division) && state ? placeName(state) : null;

  let body: React.ReactNode;
  if (!scope) {
    body = (
      <Card>
        <View style={{ gap: space.sm }} testID="nearby-ask">
          {/* The same picture as its tile on Home: the pin for painters, the bag for shops. */}
          <Feather name={kind === "painters" ? "map-pin" : "shopping-bag"} size={26} color={colors.accentText} />
          <Text variant="title3">{tab === "painters" ? t("nearby.findPainter") : t("nearby.findShop")}</Text>
          <Text variant="body" tone="soft">
            {t("nearby.why")}
          </Text>
        </View>
      </Card>
    );
  } else if (list.isPending) {
    body = (
      <View style={{ gap: space.sm }} testID="nearby-loading" accessibilityLiveRegion="polite">
        <Text variant="small" tone="mute">
          {t("nearby.looking")}
        </Text>
        <Skeleton height={150} radius={16} />
        <Skeleton height={150} radius={16} />
      </View>
    );
  } else if (list.isError && !list.data) {
    body = <ErrorState message={messageFor(list.error, t("nearby.loadFailed"))} onRetry={() => void list.refetch()} />;
  } else if (!list.data?.length) {
    body = (
      // Nobody listed there yet: news on its way, not a search that failed.
      <Card>
        <View style={{ gap: space.sm, alignItems: "flex-start" }} testID="nearby-empty">
          <Feather name={kind === "painters" ? "map-pin" : "shopping-bag"} size={26} color={colors.accentText} />
          <Pill label={t("nearby.comingSoon")} tone="accent" testID="nearby-coming-soon" />
          <Text variant="title3">
            {where
              ? t(tab === "painters" ? "nearby.paintersSoonIn" : "nearby.shopsSoonIn", { place: where })
              : t(tab === "painters" ? "nearby.paintersSoon" : "nearby.shopsSoon")}
          </Text>
          <Text variant="body" tone="soft">
            {tab === "painters" ? t("nearby.noPaintersBody") : t("nearby.noShopsBody")}
          </Text>
          {/* In a division, or near a PIN, with nobody yet: the way to the whole state. */}
          {wider ? (
            <Text variant="body" tone="soft" testID="nearby-or-all-of">
              {t("nearby.orAllOf", { state: wider })}
            </Text>
          ) : null}
        </View>
      </Card>
    );
  } else {
    body = (
      <View style={{ gap: space.sm }} testID={`nearby-${tab}`}>
        {tab === "painters"
          ? painters.data?.map((p) => <PainterCard key={p.id} painter={p} />)
          : shops.data?.map((s) => <ShopCard key={s.id} shop={s} />)}
      </View>
    );
  }

  return (
    <Screen
      scroll
      edges={back ? undefined : ["top"]}
      onRefresh={scope ? pull.onRefresh : undefined}
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
        <Select
          label={t("nearby.stateField")}
          value={state ? placeName(state) : workAreas.data ? t("nearby.stateChoose") : t("nearby.stateLoading")}
          chosen={state !== null}
          disabled={!workAreas.data}
          onPress={() => setChoosing("state")}
          testID="nearby-state"
        />
        <Select
          label={t("nearby.divisionField")}
          value={division ? placeName(division) : state ? t("nearby.divisionAll", { state: placeName(state) }) : t("nearby.stateFirst")}
          chosen={state !== null}
          // A state with no divisions (Chandigarh) is only ever searched whole.
          disabled={!state || state.divisions.length === 0}
          onPress={() => setChoosing("division")}
          testID="nearby-division"
        />
        <View style={[styles.row, styles.bottom, { gap: space.sm }]}>
          <View style={styles.fill}>
            <TextField
              label={t("nearby.pinField")}
              placeholder={t("nearby.pinPlaceholder")}
              value={pinText}
              onChangeText={(next) => {
                setPinText(next);
                setPinProblem(null);
              }}
              keyboardType="number-pad"
              autoComplete="postal-code"
              returnKeyType="search"
              maxLength={7}
              onSubmitEditing={() => void findPin()}
              testID="nearby-pin"
            />
          </View>
          <Button
            variant="secondary"
            block={false}
            label={t("nearby.pinSearch")}
            loading={findingPin}
            onPress={() => void findPin()}
            testID="nearby-pin-search"
          />
        </View>
        {pinProblem ? <Banner tone="warning" message={pinProblem} testID="nearby-pin-problem" /> : null}
        {workAreas.isError && !workAreas.data ? (
          <ErrorState message={t("nearby.statesFailed")} onRetry={() => void workAreas.refetch()} />
        ) : null}
        {pin ? (
          <Text variant="body" tone="soft" accessibilityLiveRegion="polite" testID="nearby-near">
            {t("nearby.nearPin", { place: placeLabel(pin) })}
          </Text>
        ) : state ? (
          <Text variant="body" tone="soft" accessibilityLiveRegion="polite" testID={division ? "nearby-in" : "nearby-all-of"}>
            {division
              ? t("nearby.inDivision", { division: placeName(division), state: placeName(state) })
              : t("nearby.allOf", { state: placeName(state) })}
          </Text>
        ) : null}
      </View>

      {body}

      {pin ? (
        // India Post's directory is published under the Government Open Data License, which asks
        // to be credited where its data is used.
        <Text variant="caption" tone="mute" testID="nearby-pin-credit">
          {t("nearby.pinCredit")}
        </Text>
      ) : null}

      <Sheet visible={choosing === "state"} onClose={() => setChoosing(null)} title={t("nearby.stateSheet")} testID="nearby-state-sheet">
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

      <Sheet visible={choosing === "division"} onClose={() => setChoosing(null)} title={t("nearby.divisionSheet")} testID="nearby-division-sheet">
        <ListGroup>
          {state ? (
            <ListRow
              title={t("nearby.divisionAll", { state: placeName(state) })}
              value={divisionCode === null ? t("nearby.stateChosen") : undefined}
              onPress={() => chooseDivision(null)}
              testID="nearby-division-all"
            />
          ) : null}
          {state?.divisions.map((d) => (
            <ListRow
              key={d.code}
              title={placeName(d)}
              // The big towns in it, so a customer from Bhilwara knows to pick Ajmer.
              detail={divisionTowns(d) ?? undefined}
              value={d.code === divisionCode ? t("nearby.stateChosen") : undefined}
              onPress={() => chooseDivision(d.code)}
              testID={`nearby-division-${d.code}`}
            />
          ))}
        </ListGroup>
      </Sheet>
    </Screen>
  );
}

/** "५९०००१" is a PIN's digits too: one typed on a Hindi keyboard is still a PIN. */
function westernDigits(text: string): string {
  return text.replace(/[\u0966-\u096F]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}

/** The town a PIN is in, for a sentence: "Ajmer", from "Ajmer, Rajasthan". */
function pinTown(pin: NearbyPlace): string {
  return pin.region?.split(",")[0]?.trim() || pin.name;
}

/** A box like TextField's, with its label above, that opens a list to choose from. */
function Select({
  label,
  value,
  chosen,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  /** Whether `value` is a choice, or only says what to do. */
  chosen: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text variant="fieldLabel">{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.select,
          {
            backgroundColor: colors.surface,
            borderColor: colors.ruleStrong,
            borderRadius: radius.md,
            opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
          },
        ]}
        testID={testID}
      >
        <Text variant="body" tone={chosen ? undefined : "mute"} numberOfLines={1} style={styles.fill}>
          {value}
        </Text>
        <Feather name="chevron-down" size={20} color={colors.fgMute} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  // The Search button level with the box, under the field's label.
  bottom: { alignItems: "flex-end" },
  fill: { flex: 1 },
  // A box like TextField's, that opens a list.
  select: { minHeight: 52, minWidth: minTouch, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: hairline, paddingHorizontal: 14 },
});
