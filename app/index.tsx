import { Redirect, type Href } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useSession } from "@/auth/session";
import { homeFor } from "@/auth/routing";
import { BrandMark, Button, Screen, Text } from "@/components/ui";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * A1 · "Where should this person go?" — every app start lands here.
 * Spec: docs/03-screens-auth.md — A1.
 *
 * A deep link that opened the app goes straight to its own route instead; if that
 * needs a sign-in, the route's guard remembers it for afterwards (src/auth/guards.tsx).
 */
export default function Start() {
  const { state, retry } = useSession();
  const { colors, space } = useTheme();

  if (state.status === "signedOut") return <Redirect href={(state.landing ?? "/welcome") as Href} />;
  if (state.status === "signedIn") return <Redirect href={homeFor(state.profile)} />;

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
