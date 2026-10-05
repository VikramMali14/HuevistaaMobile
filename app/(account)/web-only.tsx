import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { messageFor } from "@/api/errors";
import { tokens } from "@/api/instance";
import { homeFor } from "@/auth/routing";
import { useSession } from "@/auth/session";
import { Banner, BrandMark, Button, Card, Screen, Text } from "@/components/ui";
import { deviceToken, finishSignIn } from "@/features/auth/sign-in";
import { t } from "@/i18n";
import { openWebPage, webPages } from "@/lib/open-web";
import { useTheme } from "@/theme";

/**
 * S10 · Web-only accounts. Spec: docs/06-screens-shared.md — S10.
 *
 * Shops, distributors and HueVistaa's team work on the website. A shop whose customer
 * profile is switched on can step into it here and plan its own rooms — that switch
 * never needs the emailed code (the shop session already passed every check).
 */
export default function WebOnly() {
  const router = useRouter();
  const { space } = useTheme();
  const { profile, completeSignIn, signOut } = useSession();
  const [switching, setSwitching] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSwitch = profile?.switchTo === "CUSTOMER";

  async function continueAsCustomer() {
    if (switching) return;
    setSwitching(true);
    setError(null);
    try {
      const response = await authApi.switchProfile({
        deviceToken: await deviceToken(),
        refreshToken: tokens.refreshToken ?? undefined,
      });
      const outcome = await finishSignIn(response, completeSignIn);
      if (outcome.kind === "signedIn") router.replace(homeFor(outcome.profile) as Href);
      else setError(t("errors.generic"));
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSwitching(false);
    }
  }

  async function leave() {
    setLeaving(true);
    await signOut();
    // The root guard sends a signed-out session to Welcome.
    router.replace("/welcome");
  }

  return (
    <Screen
      scroll
      footer={
        <Button variant="ghost" label={t("common.signOut")} onPress={leave} loading={leaving} testID="web-only-sign-out" />
      }
    >
      <View style={{ gap: space.lg, marginTop: space.xxl }}>
        <BrandMark size={40} />
        <View style={{ gap: space.sm }}>
          <Text variant="title1" accessibilityRole="header">
            {t("webOnly.title")}
          </Text>
          <Text variant="lead">{t("webOnly.body")}</Text>
          {profile?.name ? (
            <Text variant="small" tone="mute">
              {t("webOnly.signedInAs", { name: profile.name })}
            </Text>
          ) : null}
        </View>
        <Button
          label={t("webOnly.openWebsite")}
          icon="external-link"
          onPress={() => openWebPage(profile?.role === "RETAILER" ? webPages.shopDashboard : "/")}
        />

        {canSwitch ? (
          <Card>
            <View style={{ gap: space.sm }}>
              <Text variant="title3">{t("webOnly.customerTitle")}</Text>
              <Text variant="body" tone="soft">
                {t("webOnly.customerBody")}
              </Text>
              <Button
                variant="secondary"
                label={t("webOnly.continueAsCustomer")}
                onPress={continueAsCustomer}
                loading={switching}
              />
            </View>
          </Card>
        ) : null}

        {error ? <Banner tone="danger" message={error} /> : null}
      </View>
    </Screen>
  );
}
