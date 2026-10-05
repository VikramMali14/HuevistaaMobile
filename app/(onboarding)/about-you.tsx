import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { painterApi } from "@/api/endpoints/painter";
import { messageFor } from "@/api/errors";
import type { UserProfile } from "@/api/types";
import { homeFor } from "@/auth/routing";
import { useSession } from "@/auth/session";
import { takeRememberedRoute } from "@/auth/use-after-sign-in";
import { Banner, Button, ChoiceCard, Screen, Text, TextField } from "@/components/ui";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

type Use = "home" | "painter";

/**
 * A10 · About you (first run). Spec: docs/03-screens-auth.md — A10.
 *
 * Asks only what this account has not answered:
 * - the name, on a first run or while the account still wears its placeholder;
 * - how they will use HueVistaa, for a brand-new customer account only — becoming a
 *   painter is for good, and the backend refuses it once there are rooms or a shop code.
 */
export default function AboutYou() {
  const router = useRouter();
  const { space } = useTheme();
  const { profile, updateProfile } = useSession();

  const firstRun = Boolean(profile?.welcomePending);
  const askName = firstRun || Boolean(profile?.namePending);
  const askUse = firstRun && profile?.role === "CUSTOMER" && !profile.linkedProfile;

  const [name, setName] = useState(profile && !profile.namePending ? profile.name : "");
  const [use, setUse] = useState<Use | null>(null);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameError = tried && askName && !name.trim() ? t("onboarding.aboutYou.nameNeeded") : null;
  const useError = tried && askUse && !use ? t("onboarding.aboutYou.chooseOne") : null;

  async function next() {
    setTried(true);
    if (!profile || busy) return;
    if ((askName && !name.trim()) || (askUse && !use)) return;
    setBusy(true);
    setError(null);
    try {
      let current: UserProfile = profile;
      if (askName && (profile.namePending || name.trim() !== profile.name)) {
        current = await authApi.updateProfile({ name: name.trim() });
      }

      if (askUse && use === "painter") {
        try {
          await painterApi.becomePainter();
        } catch (err) {
          // Refused (rooms already, a shop's code…): say why and stay a customer.
          await updateProfile(current);
          setUse("home");
          setError(messageFor(err));
          return;
        }
        // The first run ends here for a painter — the tour is a customer's.
        current = await authApi.welcomeSeen();
        await updateProfile(current);
        router.replace((takeRememberedRoute() ?? homeFor(current)) as Href);
        return;
      }

      await updateProfile(current);
      if (current.welcomePending && current.role === "CUSTOMER") {
        router.replace("/tour");
      } else {
        if (current.welcomePending) {
          current = await authApi.welcomeSeen();
          await updateProfile(current);
        }
        router.replace((takeRememberedRoute() ?? homeFor(current)) as Href);
      }
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll footer={<Button label={t("common.continue")} onPress={next} loading={busy} />}>
      <View style={{ gap: space.sm, marginTop: space.xl, marginBottom: space.xl }}>
        <Text variant="title1" accessibilityRole="header">
          {t("onboarding.aboutYou.title")}
        </Text>
      </View>

      <View style={{ gap: space.xl }}>
        {askName ? (
          <TextField
            label={t("onboarding.aboutYou.nameQuestion")}
            value={name}
            onChangeText={(next) => {
              setName(next);
              setError(null);
            }}
            error={nameError}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="done"
            autoFocus={!name}
          />
        ) : null}

        {askUse ? (
          <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
            <Text variant="fieldLabel">{t("onboarding.aboutYou.roleQuestion")}</Text>
            <ChoiceCard
              icon="home"
              title={t("onboarding.aboutYou.homeTitle")}
              body={t("onboarding.aboutYou.homeBody")}
              selected={use === "home"}
              onPress={() => {
                setUse("home");
                setError(null);
              }}
              testID="use-home"
            />
            <ChoiceCard
              icon="tool"
              title={t("onboarding.aboutYou.painterTitle")}
              body={t("onboarding.aboutYou.painterBody")}
              selected={use === "painter"}
              onPress={() => {
                setUse("painter");
                setError(null);
              }}
              testID="use-painter"
            />
            {useError ? (
              <Text variant="small" tone="danger" accessibilityRole="alert">
                {useError}
              </Text>
            ) : null}
            {use === "painter" ? <Banner tone="warning" message={t("onboarding.aboutYou.painterNote")} /> : null}
          </View>
        ) : null}

        {error ? <Banner tone="danger" message={error} /> : null}
      </View>
    </Screen>
  );
}
