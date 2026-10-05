import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { authApi } from "@/api/endpoints/auth";
import { useSession } from "@/auth/session";
import { takeRememberedRoute } from "@/auth/use-after-sign-in";
import { Button, Em, Text, useReducedMotion } from "@/components/ui";
import { welcomeFrames } from "@/features/auth/welcome-frames";
import { t, type MessageKey } from "@/i18n";
import { fonts, hairline, minTouch, useTheme } from "@/theme";

interface Card {
  start: MessageKey;
  em: MessageKey;
  end: MessageKey;
  body: MessageKey;
  image: (typeof welcomeFrames)[number]["source"];
  /** The board card shows the three shades it would carry. */
  swatches?: boolean;
}

const frame = (i: number) => (welcomeFrames[i] ?? welcomeFrames[0]!).source;

const CARDS: readonly Card[] = [
  { start: "onboarding.tour.step1Start", em: "onboarding.tour.step1Em", end: "onboarding.tour.step1End",
    body: "onboarding.tour.step1Body", image: frame(0) },
  { start: "onboarding.tour.step2Start", em: "onboarding.tour.step2Em", end: "onboarding.tour.step2End",
    body: "onboarding.tour.step2Body", image: frame(2) },
  { start: "onboarding.tour.step3Start", em: "onboarding.tour.step3Em", end: "onboarding.tour.step3End",
    body: "onboarding.tour.step3Body", image: frame(3), swatches: true },
];

/**
 * A11 · Quick tour (customers). Spec: docs/03-screens-auth.md — A11.
 *
 * Three cards, swiped or stepped through. Skip, Start and the shop-code button all count
 * as having been shown around: the first run is over for this account on every device.
 * Opened again later (S1 "Show me around"), it only replays.
 */
export default function Tour() {
  const router = useRouter();
  const { colors, space, radius } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { profile, updateProfile } = useSession();

  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const last = index === CARDS.length - 1;
  const imageHeight = Math.round(Math.min(Math.max(height * 0.38, 220), 400));

  function goTo(next: number) {
    setIndex(next);
    pager.current?.scrollTo({ x: next * width, animated: !reduced });
  }

  function onSettled(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (next !== index && next >= 0 && next < CARDS.length) setIndex(next);
  }

  /** End the first run. Leaving is instant; recording it happens behind the next screen. */
  async function finish(to: "start" | "shopCode") {
    if (leaving) return;
    setLeaving(true);
    const replay = !profile?.welcomePending;
    const remembered = takeRememberedRoute();
    if (profile && !replay) {
      await updateProfile({ ...profile, welcomePending: false });
      // Best effort: a failed write only means the tour opens once more next time.
      authApi
        .welcomeSeen()
        .then((fresh) => updateProfile(fresh))
        .catch(() => {});
    }
    if (to === "shopCode") {
      router.replace("/add-shop-code");
    } else if (replay && router.canGoBack()) {
      router.back();
    } else {
      router.replace((remembered ?? "/home") as Href);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={[styles.top, { paddingHorizontal: space.gutter }]}>
        <Text variant="small" tone="mute" accessibilityLiveRegion="polite">
          {t("onboarding.tour.stepOf", { step: index + 1, total: CARDS.length })}
        </Text>
        {!last ? (
          <Pressable
            onPress={() => finish("start")}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text variant="small" tone="accent" style={styles.skipText}>
              {t("common.skip")}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.skip} />
        )}
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onSettled}
        scrollEventThrottle={16}
        style={styles.fill}
      >
        {CARDS.map((card, i) => (
          <View
            key={card.start}
            style={{ width, paddingHorizontal: space.gutter, gap: space.lg }}
            accessibilityElementsHidden={i !== index}
            importantForAccessibility={i === index ? "auto" : "no-hide-descendants"}
          >
            <View style={[styles.picture, { height: imageHeight, borderRadius: radius.lg, borderColor: colors.rule }]}>
              <Image source={card.image} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
              {card.swatches ? (
                <View
                  style={[
                    styles.board,
                    { backgroundColor: colors.surface, borderColor: colors.ruleStrong, borderRadius: radius.md },
                  ]}
                >
                  {welcomeFrames
                    .filter((f) => f.hex)
                    .map((f) => (
                      <View key={f.labelKey} style={styles.swatchRow}>
                        <View style={[styles.swatch, { backgroundColor: f.hex!, borderColor: colors.ruleStrong }]} />
                        <Text variant="small" style={styles.swatchText}>
                          {t(f.labelKey)}
                        </Text>
                      </View>
                    ))}
                </View>
              ) : null}
            </View>
            <View style={{ gap: space.sm }}>
              <Text variant="title1" accessibilityRole="header">
                {t(card.start)}
                <Em variant="title1">{t(card.em)}</Em>
                {t(card.end)}
              </Text>
              <Text variant="lead">{t(card.body)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.bottom, { paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.md, gap: space.md }]}>
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {CARDS.map((card, i) => (
            <Pressable key={card.start} onPress={() => goTo(i)} hitSlop={10}>
              <View
                style={[
                  styles.dot,
                  {
                    width: i === index ? 22 : 8,
                    backgroundColor: i === index ? colors.fg : colors.ruleStrong,
                  },
                ]}
              />
            </Pressable>
          ))}
        </View>
        {last ? (
          <View style={{ gap: space.sm }}>
            <Button label={t("onboarding.tour.start")} onPress={() => finish("start")} loading={leaving} />
            <Button variant="secondary" label={t("onboarding.tour.haveCode")} onPress={() => finish("shopCode")} />
          </View>
        ) : (
          <Button label={t("onboarding.tour.next")} onPress={() => goTo(index + 1)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { minHeight: minTouch, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  skip: { minHeight: minTouch, minWidth: minTouch, alignItems: "flex-end", justifyContent: "center" },
  skipText: { fontFamily: fonts.semibold },
  picture: { overflow: "hidden", borderWidth: hairline },
  board: { position: "absolute", right: 14, bottom: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderWidth: hairline },
  swatchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 18, height: 18, borderRadius: 4, borderWidth: hairline },
  swatchText: { fontFamily: fonts.semibold },
  bottom: { paddingTop: 12 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 4 },
  dot: { height: 8, borderRadius: 4 },
});
