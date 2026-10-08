import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner, BrandMark, Button, Em, Text, useReducedMotion } from "@/components/ui";
import { AdminBanner } from "@/features/auth/AdminBanner";
import { authErrorMessage } from "@/features/auth/errors";
import { signInWithGoogle } from "@/features/auth/google";
import { useFinishSignIn } from "@/features/auth/use-finish-sign-in";
import { welcomeFrames } from "@/features/auth/welcome-frames";
import { t } from "@/i18n";
import { openWebPage, webPages } from "@/lib/open-web";
import { useSubmit } from "@/lib/use-submit";
import { fonts, hairline, useTheme } from "@/theme";

/** How long each shade stays on the wall, and how long the paint takes to change. */
const HOLD_MS = 2800;
const FADE_MS = 900;

/**
 * A2 · Welcome. Spec: docs/03-screens-auth.md — A2.
 *
 * Says what HueVistaa does in one look — the same room, the wall changing shade while the
 * light stays — and gets the person signed in. Mobile number first: no password to
 * invent at a counter.
 */
export default function Welcome() {
  const router = useRouter();
  const { colors, space, radius } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const finish = useFinishSignIn();

  const google = useSubmit();
  const [frame, setFrame] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);

  // Cycle the shades — or hold one still under "Reduce motion". Only while Welcome is
  // on screen: it stays mounted under the sign-in screens pushed over it.
  useFocusEffect(
    useCallback(() => {
      if (reduced) return;
      const id = setInterval(() => setFrame((f) => (f + 1) % welcomeFrames.length), HOLD_MS);
      return () => clearInterval(id);
    }, [reduced]),
  );

  const shown = welcomeFrames[reduced ? 1 : frame] ?? welcomeFrames[0]!;
  const heroHeight = Math.round(Math.min(Math.max(height * 0.42, 260), 440));

  const continueWithGoogle = () =>
    google.run(async () => {
      setError(null);
      setAdmin(false);
      try {
        const result = await signInWithGoogle();
        if (result.kind === "cancelled") return;
        if (result.kind === "failed") {
          setError(t("auth.google.failed"));
          return;
        }
        const outcome = await finish(result.response);
        if (outcome.kind === "admin") setAdmin(true);
      } catch (err) {
        setError(authErrorMessage(err));
      }
    });

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}>
        <View style={{ height: heroHeight }}>
          <Image
            source={shown.source}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="center"
            transition={reduced ? 0 : { duration: FADE_MS, effect: "cross-dissolve" }}
            accessible
            accessibilityLabel={t("auth.welcome.photoLabel")}
          />
          {/* Ink behind the wordmark and the status bar, so both read over a pale ceiling. */}
          <LinearGradient
            colors={[`${colors.bgDeep}cc`, `${colors.bgDeep}00`]}
            style={[styles.topShade, { height: insets.top + 96 }]}
            pointerEvents="none"
          />
          <View style={[styles.wordmark, { top: insets.top + 14, left: space.gutter }]}>
            <BrandMark size={26} />
            <Text variant="title3" style={styles.wordmarkText}>
              {t("common.appName")}
            </Text>
          </View>
          {/* The photo settles into the page instead of ending on a hard edge. */}
          <LinearGradient
            colors={[`${colors.bg}00`, colors.bg]}
            style={[styles.bottomShade, { height: heroHeight * 0.38 }]}
            pointerEvents="none"
          />
          <View
            style={[
              styles.tag,
              {
                left: space.gutter,
                bottom: space.md,
                borderRadius: radius.pill,
                backgroundColor: `${colors.bg}d9`,
                borderColor: colors.ruleStrong,
              },
            ]}
            // The photo's label already says what changes; announcing each shade every
            // few seconds would talk over a screen reader.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {shown.hex ? (
              <View style={[styles.dot, { backgroundColor: shown.hex, borderColor: colors.ruleStrong }]} />
            ) : null}
            <Text variant="small" style={styles.tagText}>
              {t(shown.labelKey)}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: space.gutter, gap: space.sm, marginTop: space.md }}>
          <Text variant="display" accessibilityRole="header">
            {t("auth.welcome.headlineStart")}
            <Em variant="display">{t("auth.welcome.headlineEm")}</Em>
            {t("auth.welcome.headlineEnd")}
          </Text>
          <Text variant="small" tone="mute">
            {t("auth.welcome.demoNote")}
          </Text>

          {error ? <Banner tone="danger" message={error} /> : null}
          {admin ? <AdminBanner /> : null}

          <View style={{ gap: space.sm, marginTop: space.lg }}>
            <Button label={t("auth.welcome.mobile")} icon="smartphone" onPress={() => router.push("/phone")} />
            <Button
              variant="secondary"
              label={t("auth.welcome.google")}
              loading={google.busy}
              onPress={continueWithGoogle}
            />
            <Button variant="ghost" label={t("auth.welcome.email")} onPress={() => router.push("/email-sign-in")} />
          </View>

          <Text variant="caption" tone="mute" align="center" style={{ marginTop: space.md }}>
            {t("auth.welcome.legalStart")}
            <Text
              variant="caption"
              tone="accent"
              accessibilityRole="link"
              onPress={() => openWebPage(webPages.terms)}
              suppressHighlighting
            >
              {t("auth.welcome.terms")}
            </Text>
            {t("auth.welcome.legalAnd")}
            <Text
              variant="caption"
              tone="accent"
              accessibilityRole="link"
              onPress={() => openWebPage(webPages.privacy)}
              suppressHighlighting
            >
              {t("auth.welcome.privacy")}
            </Text>
            {t("auth.welcome.legalEnd")}
          </Text>

          <View style={[styles.rule, { backgroundColor: colors.rule, marginVertical: space.md }]} />
          <Button variant="ghost" label={t("auth.welcome.shops")} onPress={() => openWebPage(webPages.forShops)} />
          {/* Development builds only: the index of every screen, to walk through them all. */}
          {__DEV__ ? (
            <Button variant="ghost" icon="list" label={t("dev.title")} onPress={() => router.push("/dev")} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topShade: { position: "absolute", top: 0, left: 0, right: 0 },
  bottomShade: { position: "absolute", bottom: 0, left: 0, right: 0 },
  wordmark: { position: "absolute", flexDirection: "row", alignItems: "center", gap: 10 },
  wordmarkText: { fontFamily: fonts.bold, letterSpacing: -0.2 },
  tag: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: hairline,
  },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: hairline },
  tagText: { fontFamily: fonts.semibold },
  rule: { height: hairline },
});
