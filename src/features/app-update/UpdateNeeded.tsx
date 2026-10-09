import { Linking, StyleSheet, View } from "react-native";

import { BrandMark, Button, Screen, Text } from "@/components/ui";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * X5 · Update needed — shown in place of every screen when this version is too old to
 * keep working. Needs no sign-in and no navigator. Nothing on the account is touched.
 */
export function UpdateNeeded({ storeUrl }: { storeUrl: string }) {
  const { space } = useTheme();
  return (
    <Screen
      footer={<Button label={t("update.button")} icon="download" onPress={() => void Linking.openURL(storeUrl).catch(() => {})} testID="update-open-store" />}
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
