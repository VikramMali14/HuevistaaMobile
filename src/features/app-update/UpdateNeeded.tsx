import { Linking, Platform, StyleSheet, View } from "react-native";

import { BrandMark, Button, Screen, Text } from "@/components/ui";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * X5 · Update needed — shown in place of every screen when this version is too old to
 * keep working. Needs no sign-in and no navigator. Nothing on the account is touched.
 * Without a store link to open, it names the store to update from instead.
 */
export function UpdateNeeded({ storeUrl }: { storeUrl: string | null }) {
  const { space } = useTheme();
  return (
    <Screen
      footer={
        storeUrl ? (
          <Button label={t("update.button")} icon="download" onPress={() => void Linking.openURL(storeUrl).catch(() => {})} testID="update-open-store" />
        ) : (
          <Text variant="body" tone="soft" align="center" testID="update-from-store">
            {Platform.OS === "ios" ? t("update.fromAppStore") : t("update.fromPlayStore")}
          </Text>
        )
      }
    >
      <View style={[styles.center, { gap: space.lg }]} testID="update-needed">
        <BrandMark size={56} />
        <Text variant="title1" align="center" accessibilityRole="header">
          {t("update.title")}
        </Text>
        <Text variant="lead" tone="soft" align="center">
          {t("update.body")}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
