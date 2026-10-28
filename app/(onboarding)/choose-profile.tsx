import { Redirect, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { messageFor } from "@/api/errors";
import { tokens } from "@/api/instance";
import { useSession } from "@/auth/session";
import { settleSideChoice } from "@/auth/side-choice";
import { useOnwardRoute } from "@/auth/use-after-sign-in";
import { Banner, Button, ChoiceCard, Screen, Text } from "@/components/ui";
import { givenName } from "@/features/account/display-name";
import { deviceToken, finishSignIn } from "@/features/auth/sign-in";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/** The account just signed into — the painter or the shop — or its customer side. */
type Side = "own" | "customer";

/**
 * A12 · Continue as. Spec: docs/03-screens-auth.md — A12. Web reference:
 * HueVistaFrontEnd/src/app/choose-profile/page.tsx.
 *
 * One sign-in, two sides: a painter or a shop owner whose customer side is on is asked,
 * right after signing in, which to continue as. The session is already the painter's or
 * the shop's, so choosing that just carries on — to the painter's home, or S10 for a
 * shop, whose tools are on the website. "A customer" is the switch to the customer
 * profile, which never needs a second code. Then the sign-in goes where it was going: the
 * chosen side's first run if it has one, the page opened before signing in, or home.
 *
 * Asked once, for the sign-in that asked: an account with nothing to choose between — or
 * that has just chosen — is sent straight on.
 */
export default function ChooseProfile() {
  const { space } = useTheme();
  const { profile, completeSignIn, signOut } = useSession();
  const switching = useSubmit();
  const leaving = useSubmit();
  const [side, setSide] = useState<Side | null>(null);
  const [chosen, setChosen] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The question belongs to the sign-in that asked it: from here on it has been asked.
  useEffect(() => settleSideChoice(), []);

  // Nothing to choose between — the customer side was just switched to, or there is
  // none — or the choice is made: on to wherever this sign-in was going.
  const twoSided = profile?.switchTo === "CUSTOMER";
  const onward = useOnwardRoute(profile && (chosen || !twoSided) ? profile : null);

  if (!profile) return null; // The onboarding guard is already on its way to Welcome.
  if (onward) return <Redirect href={onward as Href} />;

  const painter = profile.role === "PAINTER";
  const name = givenName(profile);

  const go = () => {
    setTried(true);
    if (!side) return;
    if (side === "own") {
      setChosen(true);
      return;
    }
    void switching.run(async () => {
      setError(null);
      try {
        const response = await authApi.switchProfile({
          deviceToken: await deviceToken(),
          refreshToken: tokens.refreshToken ?? undefined,
        });
        const outcome = await finishSignIn(response, completeSignIn);
        // signedIn: the session is the customer profile's now, and the redirect above moves on.
        if (outcome.kind !== "signedIn") setError(t("errors.generic"));
      } catch (err) {
        setError(messageFor(err));
      }
    });
  };

  const pick = (next: Side) => {
    setSide(next);
    setError(null);
  };

  return (
    <Screen
      scroll
      footer={
        <Button label={t("common.continue")} onPress={go} loading={switching.busy} testID="choose-side-continue" />
      }
    >
      <View style={{ gap: space.sm, marginTop: space.xl, marginBottom: space.xl }}>
        <Text variant="title1" accessibilityRole="header">
          {t("auth.chooseSide.title")}
        </Text>
        <Text variant="lead">
          {name ? t("auth.chooseSide.leadNamed", { name }) : t("auth.chooseSide.lead")}
        </Text>
      </View>

      <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
        <ChoiceCard
          icon={painter ? "tool" : "shopping-bag"}
          title={painter ? t("auth.chooseSide.painterTitle") : t("auth.chooseSide.shopTitle")}
          body={painter ? t("auth.chooseSide.painterBody") : t("auth.chooseSide.shopBody")}
          selected={side === "own"}
          onPress={() => pick("own")}
          testID="choose-side-own"
        />
        <ChoiceCard
          icon="home"
          title={t("auth.chooseSide.customerTitle")}
          body={painter ? t("auth.chooseSide.customerBodyPainter") : t("auth.chooseSide.customerBodyShop")}
          selected={side === "customer"}
          onPress={() => pick("customer")}
          testID="choose-side-customer"
        />
        {tried && !side ? (
          <Text variant="small" tone="danger" accessibilityRole="alert">
            {t("auth.chooseSide.chooseOne")}
          </Text>
        ) : null}
        <Text variant="small" tone="mute">
          {t("auth.chooseSide.switchLater")}
        </Text>
      </View>

      {error ? (
        <View style={{ marginTop: space.lg }}>
          <Banner tone="danger" message={error} />
        </View>
      ) : null}

      {/* Signed in with the wrong account? Without this the only way out is through. */}
      <View style={{ marginTop: space.lg }}>
        <Button
          variant="ghost"
          block={false}
          label={t("onboarding.aboutYou.notYou")}
          onPress={() => leaving.run(() => signOut())}
          loading={leaving.busy}
        />
      </View>
    </Screen>
  );
}
