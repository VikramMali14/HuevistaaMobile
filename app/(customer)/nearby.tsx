import Feather from "@expo/vector-icons/Feather";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";

import { messageFor } from "@/api/errors";
import { BackButton, Banner, Button, Card, Chip, ErrorState, Screen, Segmented, Skeleton, Text } from "@/components/ui";
import { alreadyAllowed, locate, type Located } from "@/features/nearby/locate";
import { DEFAULT_RADIUS_KM, MAX_RESULTS, RADII_KM, widerRadius, type RadiusKm, type SearchPoint } from "@/features/nearby/nearby";
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
 */
export default function Nearby() {
  const { space, colors } = useTheme();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "shops" ? "shops" : "painters");
  const [radius, setRadius] = useState<RadiusKm>(DEFAULT_RADIUS_KM);
  const [point, setPoint] = useState<SearchPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<Exclude<Located, { kind: "fix" }> | null>(null);
  const live = useRef(true);
  const painters = useNearbyPainters(point, radius);
  const shops = useNearbyShops(point, radius);
  const pull = usePullToRefresh(async () => {
    if (point) await Promise.all([painters.refetch(), shops.refetch()]);
  });

  const find = async () => {
    setLocating(true);
    setProblem(null);
    const where = await locate();
    if (!live.current) return;
    setLocating(false);
    if (where.kind === "fix") setPoint(where.point);
    else setProblem(where);
  };

  // A customer who already let HueVistaa use the location needn't be asked to press for it.
  useEffect(() => {
    live.current = true;
    void alreadyAllowed().then((yes) => {
      if (yes && live.current) void find();
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
    <Screen scroll onRefresh={point ? pull.onRefresh : undefined} refreshing={pull.refreshing} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <BackButton fallback="/home" />
      <View style={{ gap: space.xs }}>
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

      <View style={{ gap: space.xs }}>
        <View style={[styles.row, { gap: space.sm }]}>
          <Text variant="fieldLabel" style={styles.fill}>
            {t("nearby.within")}
          </Text>
          {point ? (
            <Button variant="ghost" block={false} icon="crosshair" label={locating ? t("nearby.finding") : t("nearby.updateLocation")} loading={locating} onPress={() => void find()} testID="nearby-relocate" />
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
  fill: { flex: 1 },
});
