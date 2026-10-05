import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Platform, View } from "react-native";

import { useSession } from "@/auth/session";
import { BackButton, ConfirmSheet, ListGroup, ListRow, Screen, Text, useToast } from "@/components/ui";
import { t } from "@/i18n";
import { appVersion } from "@/lib/app-version";
import { openWebPage, webPages } from "@/lib/open-web";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/** Taps on the version row that copy the app's details for support. */
const DIAGNOSTIC_TAPS = 7;

/**
 * S1 · Settings. Spec: docs/06-screens-shared.md — S1.
 *
 * Appearance follows the phone (no switch, like the website). Legal pages open from the
 * website so they are always current. Seven taps on the version copy the details a
 * support conversation asks for.
 */
export default function Settings() {
  const router = useRouter();
  const toast = useToast();
  const { space } = useTheme();
  const { profile, signOut } = useSession();
  const leaving = useSubmit();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const taps = useRef(0);
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
        <ListRow icon="globe" title={t("settings.language")} value={t("settings.languageValue")} />
      </ListGroup>

      <ListGroup title={t("settings.legal")}>
        <ListRow title={t("settings.terms")} onPress={() => void openWebPage(webPages.terms)} />
        <ListRow title={t("settings.privacy")} onPress={() => void openWebPage(webPages.privacy)} />
        <ListRow title={t("settings.refunds")} onPress={() => void openWebPage(webPages.refunds)} />
        <ListRow title={t("settings.about")} onPress={() => void openWebPage(webPages.about)} />
        <ListRow title={t("settings.contact")} onPress={() => void openWebPage(webPages.contact)} />
      </ListGroup>

      <ListGroup title={t("settings.app")}>
        <ListRow title={t("settings.version")} value={`${version} (${build})`} onPress={() => void tapVersion()} testID="settings-version" />
      </ListGroup>

      <ListGroup>
        <ListRow icon="log-out" title={t("common.signOut")} tone="danger" onPress={() => setConfirmSignOut(true)} />
        <ListRow icon="trash-2" title={t("settings.deleteAccount")} tone="danger" onPress={() => router.push("/delete-account")} />
      </ListGroup>

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
