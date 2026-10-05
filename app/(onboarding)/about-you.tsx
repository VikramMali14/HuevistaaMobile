import { useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { painterApi } from "@/api/endpoints/painter";
import { messageFor } from "@/api/errors";
import type { UserProfile } from "@/api/types";
import { homeFor } from "@/auth/routing";
import { useSession } from "@/auth/session";
import { takeRememberedRoute } from "@/auth/use-after-sign-in";
import { Banner, Button, ChoiceCard, Screen, Text, TextField } from "@/components/ui";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { NAME_MAX, validateName } from "@/lib/validation";
import { useTheme } from "@/theme";

type Use = "home" | "painter";

/** Where the first run goes after this screen, for a profile the server just returned. */
function useEndFirstRun() {
  const router = useRouter();
  const { markWelcomeSeen } = useSession();

  return async (current: UserProfile) => {
    if (current.role === "CUSTOMER" && current.welcomePending) {
      router.replace("/tour");
      return;
    }
    let done = current;
    if (current.welcomePending) {
      // Not a customer: there is no tour, so the first run ends here. Best effort — the
      // session sends it again at the next start if it does not get through.
      done = await markWelcomeSeen().catch(() => ({ ...current, welcomePending: false }));
    }
    router.replace((takeRememberedRoute() ?? homeFor({ ...done, namePending: false })) as Href);
  };
}

/**
 * A10 · About you (first run). Spec: docs/03-screens-auth.md — A10.
 *
 * Asks only what this account has not answered, decided once on arrival:
 * - the name, while the account still wears its placeholder (a mobile sign-up). A name
 *   given on A6 or by Google is not asked for again — the website does the same;
 * - how they will use HueVistaa, for a brand-new customer account only — becoming a
 *   painter is for good, and the backend refuses it once there are rooms or a shop code.
 * With nothing to ask, it moves straight on.
 */
export default function AboutYou() {
  const { profile } = useSession();
  // Fixed on arrival: a field must not vanish because its answer was just saved.
  const [asks] = useState(() => ({
    name: Boolean(profile?.namePending),
    use: Boolean(profile?.welcomePending) && profile?.role === "CUSTOMER" && !profile?.linkedProfile,
  }));

  if (!profile) return null; // The onboarding guard is already on its way to Welcome.
  if (!asks.name && !asks.use) return <MovingOn profile={profile} />;
  return <Questions profile={profile} askName={asks.name} askUse={asks.use} />;
}

function Questions({ profile, askName, askUse }: { profile: UserProfile; askName: boolean; askUse: boolean }) {
  const router = useRouter();
  const { space } = useTheme();
  const { updateProfile, markWelcomeSeen, signOut } = useSession();
  const endFirstRun = useEndFirstRun();
  const saving = useSubmit();
  const leaving = useSubmit();

  const [name, setName] = useState("");
  const [use, setUse] = useState<Use | null>(null);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameKey = askName ? validateName(name) : null;
  const nameError = tried && nameKey ? t(nameKey === "validation.nameRequired" ? "onboarding.aboutYou.nameNeeded" : nameKey) : null;
  const useError = tried && askUse && !use ? t("onboarding.aboutYou.chooseOne") : null;

  const next = () => {
    setTried(true);
    if (nameKey || (askUse && !use)) return;
    void saving.run(async () => {
      setError(null);
      try {
        let current = profile;
        if (askName) {
          current = await authApi.updateProfile({ name: name.trim() });
          await updateProfile(current);
        }

        if (askUse && use === "painter") {
          try {
            await painterApi.becomePainter();
          } catch (err) {
            // Refused (rooms already, a shop's code…): say why and stay a customer.
            setUse("home");
            setError(messageFor(err));
            return;
          }
          // A painter now, for good. The tour is a customer's, so the first run ends
          // here; its answer is the reloaded profile. If it fails, Continue again is
          // safe — becoming a painter twice is a no-op.
          const painter = await markWelcomeSeen();
          router.replace((takeRememberedRoute() ?? homeFor(painter)) as Href);
          return;
        }

        await endFirstRun(current);
      } catch (err) {
        setError(messageFor(err));
      }
    });
  };

  return (
    <Screen scroll footer={<Button label={t("common.continue")} onPress={next} loading={saving.busy} />}>
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
            maxLength={NAME_MAX}
            autoComplete="name"
            textContentType="name"
            returnKeyType="done"
            autoFocus
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

        {/* Signed in with the wrong account? Without this the only way out is through. */}
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

/** Nothing left to ask — e.g. a shop's customer profile, or a painter with a name. */
function MovingOn({ profile }: { profile: UserProfile }) {
  const { colors, space } = useTheme();
  const endFirstRun = useEndFirstRun();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void endFirstRun(profile);
  }, [endFirstRun, profile]);

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.md }}>
        <ActivityIndicator color={colors.fg} />
        <Text tone="soft">{t("onboarding.aboutYou.finishing")}</Text>
      </View>
    </Screen>
  );
}
