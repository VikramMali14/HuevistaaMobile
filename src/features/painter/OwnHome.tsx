import { useState } from "react";
import { View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { messageFor } from "@/api/errors";
import { tokens } from "@/api/instance";
import { useSession } from "@/auth/session";
import { Banner, Button, Card, Text } from "@/components/ui";
import { deviceToken, finishSignIn } from "@/features/auth/sign-in";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/**
 * P12 "Your own home": the painter's customer profile, one tap away.
 *
 * A painter paints other people's walls and has walls of their own. Their own rooms live on
 * a separate CUSTOMER account behind this same sign-in — the arrangement a shop owner has —
 * and a customer who started as a painter with rooms already finds them there. The tap
 * turns the profile on if it is off, then switches to it: a painter going there or back
 * never needs a second code. Once the session is the profile's, the painter screens' guard
 * moves on to the customer's home, and the account tab there switches back.
 */
export function OwnHome() {
  const { space } = useTheme();
  const { profile, completeSignIn } = useSession();
  const going = useSubmit();
  const [error, setError] = useState<string | null>(null);
  const on = profile?.switchTo === "CUSTOMER";

  const go = () =>
    void going.run(async () => {
      setError(null);
      try {
        if (!on) await authApi.setCustomerProfile(true);
        const response = await authApi.switchProfile({
          deviceToken: await deviceToken(),
          refreshToken: tokens.refreshToken ?? undefined,
        });
        const outcome = await finishSignIn(response, completeSignIn);
        if (outcome.kind !== "signedIn") setError(t("errors.generic"));
      } catch (err) {
        setError(messageFor(err));
      }
    });

  return (
    <Card>
      <View style={{ gap: space.sm }}>
        <Text variant="title3">{t("painter.profile.ownHomeTitle")}</Text>
        <Text variant="body" tone="soft">
          {on ? t("painter.profile.ownHomeOn") : t("painter.profile.ownHomeOff")}
        </Text>
        {error ? <Banner tone="danger" message={error} /> : null}
        <Button
          variant="secondary"
          label={t("painter.profile.ownHomeGo")}
          onPress={go}
          loading={going.busy}
          testID="painter-own-home"
        />
      </View>
    </Card>
  );
}
