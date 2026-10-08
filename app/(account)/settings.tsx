import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Platform, View } from "react-native";

import { useSession } from "@/auth/session";
import { BackButton, Button, ChoiceCard, ConfirmSheet, ListGroup, ListRow, Screen, Sheet, Text, useToast } from "@/components/ui";
import { getLanguage, t, type Language } from "@/i18n";
import { chooseLanguage, languageChoice, phoneLanguage, type LanguageChoice } from "@/i18n/language";
import { appVersion } from "@/lib/app-version";
import { landNextOn } from "@/navigation/landing";
import { openWebPage, webPages } from "@/lib/open-web";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/** Taps on the version row that copy the app's details for support. */
const DIAGNOSTIC_TAPS = 7;

/** A language by its own name, the same in every language. */
const languageName = (language: Language) => (language === "hi" ? t("settings.languageHindi") : t("settings.languageEnglish"));

/**
 * S1 · Settings. Spec: docs/06-screens-shared.md — S1.
 *
 * Appearance follows the phone (no switch, like the website). Legal pages open from the
 * website so they are always current. Seven taps on the version copy the details a
 * support conversation asks for; pressing and holding it opens the live-colour check.
 */
export default function Settings() {
  const router = useRouter();
  const toast = useToast();
  const { space } = useTheme();
  const { profile, signOut } = useSession();
  const leaving = useSubmit();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [picking, setPicking] = useState(false);
  const choice = languageChoice();
  const taps = useRef(0);

  // A new language remounts every screen (app/_layout.tsx); this one is opened again after.
  const pick = (next: LanguageChoice) => {
    setPicking(false);
    const now = getLanguage();
    if ((next === "phone" ? phoneLanguage() : next) !== now) landNextOn("/settings");
    void chooseLanguage(next);
  };
  const { version, build } = appVersion();

  const tapVersion = async () => {
    taps.current += 1;
    if (taps.current < DIAGNOSTIC_TAPS) return;
    taps.current = 0;
    const details = [
      `HueVistaa ${version} (${build})`,
      `${Platform.OS} ${String(Platform.Version)}`,
      `Account ${profile?.id ?? "—"} · ${profile?.role ?? "—"}`,
    ].join("\n");
    await Clipboard.setStringAsync(details).catch(() => {});
    toast.show(t("settings.diagnosticsCopied"), "success");
  };

  return (
    <Screen scroll contentStyle={{ gap: space.xl, paddingBottom: space.xxl }}>
      <View style={{ gap: space.sm }}>
        <BackButton fallback="/account" />
        <Text variant="title1" accessibilityRole="header">
          {t("settings.title")}
        </Text>
      </View>

      <ListGroup>
        <ListRow icon="moon" title={t("settings.appearance")} detail={t("settings.appearanceValue")} />
        {profile?.role === "CUSTOMER" ? (
          <ListRow icon="compass" title={t("settings.showAround")} onPress={() => router.push("/tour")} />
        ) : null}
        <ListRow
          icon="globe"
          title={t("settings.language")}
          value={choice === "phone" ? t("settings.languagePhoneValue", { language: languageName(phoneLanguage()) }) : languageName(choice)}
          onPress={() => setPicking(true)}
          testID="settings-language"
        />
      </ListGroup>

      <ListGroup title={t("settings.legal")}>
        <ListRow title={t("settings.terms")} onPress={() => void openWebPage(webPages.terms)} />
        <ListRow title={t("settings.privacy")} onPress={() => void openWebPage(webPages.privacy)} />
        <ListRow title={t("settings.refunds")} onPress={() => void openWebPage(webPages.refunds)} />
        <ListRow title={t("settings.about")} onPress={() => void openWebPage(webPages.about)} />
        <ListRow title={t("settings.contact")} onPress={() => void openWebPage(webPages.contact)} />
      </ListGroup>

      <ListGroup title={t("settings.app")}>
        <ListRow
          title={t("settings.version")}
          value={`${version} (${build})`}
          onPress={() => void tapVersion()}
          onLongPress={() => router.push("/engine-check")}
          testID="settings-version"
        />
      </ListGroup>

      <ListGroup>
        <ListRow icon="log-out" title={t("common.signOut")} tone="danger" onPress={() => setConfirmSignOut(true)} />
        {/* Not on a shop's customer profile: that is turned off from the shop, which keeps
            its rooms (the website's account page leaves it out too). */}
        {profile && !profile.linkedProfile ? (
          <ListRow icon="trash-2" title={t("settings.deleteAccount")} tone="danger" onPress={() => router.push("/delete-account")} />
        ) : null}
      </ListGroup>

      <Sheet visible={picking} onClose={() => setPicking(false)} title={t("settings.language")} testID="language-sheet">
        <View style={{ gap: space.sm }}>
          <ChoiceCard
            title={t("settings.languagePhone")}
            body={t("settings.languagePhoneBody")}
            selected={choice === "phone"}
            onPress={() => pick("phone")}
            testID="language-phone"
          />
          {(["en", "hi"] as const).map((language) => (
            <ChoiceCard key={language} title={languageName(language)} selected={choice === language} onPress={() => pick(language)} testID={`language-${language}`} />
          ))}
          <Text variant="small" tone="mute">
            {t("settings.languageNote")}
          </Text>
          <Button variant="secondary" label={t("settings.languageDone")} onPress={() => setPicking(false)} />
        </View>
      </Sheet>

      <ConfirmSheet
        visible={confirmSignOut}
        title={t("account.signOutTitle")}
        body={t("account.signOutBody")}
        confirmLabel={t("common.signOut")}
        loading={leaving.busy}
        onConfirm={() => void leaving.run(() => signOut())}
        onCancel={() => setConfirmSignOut(false)}
      />
    </Screen>
  );
}
