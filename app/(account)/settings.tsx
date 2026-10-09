import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";

import { useSession } from "@/auth/session";
import { BackButton, Button, ChoiceCard, ConfirmSheet, ListGroup, ListRow, Screen, Sheet, Text, useToast } from "@/components/ui";
import { versionGate } from "@/features/app-update/min-version";
import { askForPush, pushPermission, pushSupported, registerPush, type PushPermission } from "@/features/notifications/notifications";
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
  const { state, profile, signOut } = useSession();
  const leaving = useSubmit();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [picking, setPicking] = useState(false);
  const [push, setPush] = useState<PushPermission | null>(null);
  const choice = languageChoice();
  const gate = versionGate();

  // Read again on coming back — perhaps from the phone's settings.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void pushPermission().then((now) => alive && setPush(now));
      return () => {
        alive = false;
      };
    }, []),
  );

  const notifications = async () => {
    if (push === "ask") {
      const granted = await askForPush();
      setPush(granted ? "granted" : await pushPermission());
      if (granted && state.status === "signedIn" && !state.preview) void registerPush(state.profile.id);
      return;
    }
    // On, or only the phone's settings can turn them on: that's where they're changed.
    await Linking.openSettings().catch(() => {});
  };
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
        {pushSupported() ? (
          <ListRow
            icon="bell"
            title={t("notifications.row")}
            value={push === "granted" ? t("notifications.on") : push ? t("notifications.off") : undefined}
            detail={push === "settings" ? t("notifications.offHint") : undefined}
            onPress={() => void notifications()}
            testID="settings-notifications"
          />
        ) : null}
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
        {gate.updateAvailable && gate.storeUrl ? (
          <ListRow icon="download" title={t("update.available")} onPress={() => void Linking.openURL(gate.storeUrl!).catch(() => {})} testID="settings-update" />
        ) : null}
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
