import * as Linking from "expo-linking";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { useAfterSignInTarget } from "@/auth/use-after-sign-in";
import { Button, Screen, Text } from "@/components/ui";
import { AdminBanner } from "@/features/auth/AdminBanner";
import { authErrorMessage } from "@/features/auth/errors";
import { exchangeGoogleCodeOnce, isRejectedGoogleCode, parseAuthCallback } from "@/features/auth/google";
import { useFinishSignIn } from "@/features/auth/use-finish-sign-in";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

type Phase = { kind: "working" } | { kind: "failed"; message: string } | { kind: "admin" };

/**
 * A9 · Google sign-in, the cold-start half. Spec: docs/03-screens-auth.md — A9.
 *
 * Usually the browser session on A2 receives huevista://sign-in/callback#code=… and this
 * screen never shows. It opens when Android starts the app straight at the deep link
 * instead. The code is in the fragment, which routing does not see, so it is read from
 * the URL that opened the app. Both paths share one exchange per code.
 */
export default function GoogleCallback() {
  const router = useRouter();
  const { colors, space } = useTheme();
  const finish = useFinishSignIn();
  const target = useAfterSignInTarget();
  const url = Linking.useLinkingURL();
  const query = useLocalSearchParams<{ code?: string; error?: string }>();

  const fromUrl = parseAuthCallback(url);
  const code = fromUrl.code ?? query.code;
  const failedAtGoogle = Boolean(fromUrl.error ?? query.error);

  const [phase, setPhase] = useState<Phase>({ kind: "working" });
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (target || !code || failedAtGoogle || started.current === code) return;
    started.current = code;
    exchangeGoogleCodeOnce(code)
      .then(finish)
      .then((outcome) => {
        if (outcome.kind === "admin") setPhase({ kind: "admin" });
        // signedIn: `target` appears and the redirect below takes over.
        // emailCode: useFinishSignIn has already opened A8.
      })
      .catch((err: unknown) =>
        setPhase({
          kind: "failed",
          message: isRejectedGoogleCode(err) ? t("auth.google.failed") : authErrorMessage(err),
        }),
      );
  }, [code, failedAtGoogle, finish, target]);

  if (target) return <Redirect href={target as Href} />;

  // Google said no, or the link carried no code: nothing to exchange.
  const shown: Phase = failedAtGoogle || !code ? { kind: "failed", message: t("auth.google.failed") } : phase;

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: space.lg }}>
        {shown.kind === "working" ? (
          <View style={{ alignItems: "center", gap: space.md }} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.fg} />
            <Text variant="body" tone="soft">
              {t("auth.google.signingIn")}
            </Text>
          </View>
        ) : (
          <>
            {shown.kind === "admin" ? (
              <AdminBanner />
            ) : (
              <Text variant="title2" accessibilityRole="alert">
                {shown.message}
              </Text>
            )}
            <Button
              variant={shown.kind === "admin" ? "secondary" : "primary"}
              label={t("auth.google.backToStart")}
              onPress={() => router.replace("/welcome")}
            />
          </>
        )}
      </View>
    </Screen>
  );
}
