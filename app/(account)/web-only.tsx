import { Redirect, type Href } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { messageFor } from "@/api/errors";
import { tokens } from "@/api/instance";
import type { UserRole } from "@/api/types";
import { homeFor } from "@/auth/routing";
import { useSession } from "@/auth/session";
import { Banner, BrandMark, Button, Card, Screen, Text } from "@/components/ui";
import { deviceToken, finishSignIn } from "@/features/auth/sign-in";
import { t, type MessageKey } from "@/i18n";
import { openWebPage, webPages } from "@/lib/open-web";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/** What each web-only role is told, and where on the website it works. */
const forRole: Partial<Record<UserRole, { title: MessageKey; open: MessageKey; page: string }>> = {
  RETAILER: { title: "webOnly.title", open: "webOnly.openWebsite", page: webPages.shopDashboard },
  DISTRIBUTOR: { title: "webOnly.titleDistributor", open: "webOnly.openSite", page: webPages.shopDashboard },
  ADMIN: { title: "webOnly.titleAdmin", open: "webOnly.openSite", page: webPages.admin },
};

/**
 * S10 · Web-only accounts. Spec: docs/06-screens-shared.md — S10.
 *
 * Shops, distributors and HueVistaa's team work on the website. A shop whose customer
 * profile is switched on can step into it here and plan its own rooms — that switch
 * never needs the emailed code (the shop session already passed every check).
 *
 * Only for those roles: anyone else who reaches this address (a typed link, an old
 * bookmark) is sent to their own home.
 */
export default function WebOnly() {
  const { space } = useTheme();
  const { profile, completeSignIn, signOut } = useSession();
  const switching = useSubmit();
  const leaving = useSubmit();
  const [error, setError] = useState<string | null>(null);

  if (!profile) return null; // The account guard is already on its way to Welcome.
  const home = homeFor(profile);
  // Not a web-only account — including the moment a shop has switched to its customer
  // profile, which is how "Continue as customer" arrives at /home.
  if (home !== "/web-only") return <Redirect href={home as Href} />;

  const copy = forRole[profile.role] ?? forRole.RETAILER!;
  const canSwitch = profile.switchTo === "CUSTOMER";

  const continueAsCustomer = () =>
    switching.run(async () => {
      setError(null);
      try {
        const response = await authApi.switchProfile({
          deviceToken: await deviceToken(),
          refreshToken: tokens.refreshToken ?? undefined,
        });
        const outcome = await finishSignIn(response, completeSignIn);
        // signedIn: the profile is now the customer one, and the redirect above moves on.
        if (outcome.kind !== "signedIn") setError(t("errors.generic"));
      } catch (err) {
        setError(messageFor(err));
      }
    });

  return (
    <Screen
      scroll
      footer={
        <Button
          variant="ghost"
          label={t("common.signOut")}
          onPress={() => leaving.run(() => signOut())}
          loading={leaving.busy}
          testID="web-only-sign-out"
        />
      }
    >
      <View style={{ gap: space.lg, marginTop: space.xxl }}>
        <BrandMark size={40} />
        <View style={{ gap: space.sm }}>
          <Text variant="title1" accessibilityRole="header">
            {t(copy.title)}
          </Text>
          <Text variant="lead">{t("webOnly.body")}</Text>
          {profile.name ? (
            <Text variant="small" tone="mute">
              {t("webOnly.signedInAs", { name: profile.name })}
            </Text>
          ) : null}
        </View>
        <Button label={t(copy.open)} icon="external-link" onPress={() => openWebPage(copy.page)} />

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
                loading={switching.busy}
              />
            </View>
          </Card>
        ) : null}

        {error ? <Banner tone="danger" message={error} /> : null}
      </View>
    </Screen>
  );
}
