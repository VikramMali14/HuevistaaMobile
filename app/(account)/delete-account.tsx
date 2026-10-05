import Feather from "@expo/vector-icons/Feather";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { messageFor } from "@/api/errors";
import { useSession } from "@/auth/session";
import { FormScreen } from "@/components/FormScreen";
import { Banner, Button, Text, useToast } from "@/components/ui";
import { useBalance } from "@/features/account/use-balance";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { hairline, useTheme } from "@/theme";

/**
 * S9 · Delete account. Spec: docs/06-screens-shared.md — S9.
 *
 * Google Play requires deleting an account from inside the app. It lists exactly what
 * goes, and a tick box "I understand this can't be undone" unlocks the button.
 */
export default function DeleteAccount() {
  const toast = useToast();
  const { colors, radius, space } = useTheme();
  const { profile, signOut } = useSession();
  const balance = useBalance();
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmit();

  const items = (profile?.role === "PAINTER" ? t("deleteScreen.painterItems") : t("deleteScreen.customerItems")).split("|");
  if (profile?.role === "CUSTOMER" && balance.entitlement) items.push(t("deleteScreen.shopKeeps"));

  if (profile?.linkedProfile) {
    return (
      <FormScreen title={t("deleteScreen.title")} backFallback="/settings">
        <Banner tone="info" message={t("deleteScreen.linked")} />
      </FormScreen>
    );
  }

  const remove = () => {
    if (!understood) return;
    void run(async () => {
      setError(null);
      try {
        await authApi.deleteAccount();
        toast.show(t("deleteScreen.done"), "success");
        await signOut({ serverAlreadyKnows: true });
      } catch (err) {
        setError(messageFor(err));
      }
    });
  };

  return (
    <FormScreen
      title={t("deleteScreen.title")}
      lead={t("deleteScreen.lead")}
      backFallback="/settings"
      footer={<Button variant="danger" label={t("deleteScreen.confirm")} onPress={remove} disabled={!understood} loading={busy} />}
    >
      <View style={{ gap: space.xs }}>
        {items.map((line) => (
          <View key={line} style={styles.item}>
            <Feather name="minus" size={16} color={colors.dangerText} style={styles.dash} />
            <Text variant="body" style={{ flex: 1 }}>
              {line}
            </Text>
          </View>
        ))}
      </View>
      <Pressable
        onPress={() => setUnderstood((u) => !u)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: understood }}
        style={[styles.check, { borderColor: understood ? colors.dangerText : colors.ruleStrong, borderRadius: radius.md, padding: space.md }]}
        testID="delete-understand"
      >
        <View
          style={[
            styles.box,
            {
              borderColor: understood ? colors.dangerText : colors.ruleStrong,
              backgroundColor: understood ? colors.warmFill : "transparent",
              borderRadius: radius.xs,
            },
          ]}
        >
          {understood ? <Feather name="check" size={16} color="#ffffff" /> : null}
        </View>
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {t("deleteScreen.understand")}
        </Text>
      </Pressable>
      {error ? <Banner tone="danger" message={error} /> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  dash: { marginTop: 4 },
  check: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: hairline },
  box: { width: 24, height: 24, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
