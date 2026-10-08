import { Redirect, type Href } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useSession } from "@/auth/session";
import { homeFor } from "@/auth/routing";
import { BrandMark, Button, Screen, Text } from "@/components/ui";
import { t } from "@/i18n";
import { clearLanding, peekLanding } from "@/navigation/landing";
import { useTheme } from "@/theme";

/**
 * A1 · "Where should this person go?" — every app start lands here.
 * Spec: docs/03-screens-auth.md — A1.
 *
 * A deep link that opened the app goes straight to its own route instead; if that
 * needs a sign-in, the route's guard remembers it for afterwards (src/auth/guards.tsx).
 * A one-off landing (S1 after a change of language) takes the place of home, once.
 */
export default function Start() {
  const { state, retry } = useSession();
  const { colors, space } = useTheme();
  const landing = state.status === "signedIn" ? peekLanding(state.profile.id) : null;
  useEffect(() => {
    if (landing) clearLanding();
  }, [landing]);

  if (state.status === "signedOut") return <Redirect href={(state.landing ?? "/welcome") as Href} />;
  if (state.status === "signedIn") return <Redirect href={(landing ?? homeFor(state.profile)) as Href} />;

  // Only reached once the splash has hidden: either still loading after 8 s, or the
  // server can't be reached and nothing was cached.
  return (
    <Screen>
      <View style={[styles.center, { gap: space.lg }]}>
        <BrandMark size={56} />
        {state.status === "loading" ? (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text tone="soft">{t("boot.stillConnecting")}</Text>
          </>
        ) : (
          <>
            <Text tone="soft" align="center">
              {t("boot.cantReach")}
            </Text>
            <Button label={t("common.retry")} onPress={retry} block={false} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
