import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { useSession } from "@/auth/session";
import { Avatar, Text } from "@/components/ui";
import { givenName } from "@/features/account/display-name";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * The head of each painter tab (docs/05): a small eyebrow, the screen's title, and the
 * painter's avatar, which opens their trade profile (P12) — where Settings (S1) is.
 */
export function PainterHeader({ eyebrow, title }: { eyebrow?: string | null; title: string }) {
  const router = useRouter();
  const { space } = useTheme();
  const { profile } = useSession();
  return (
    <View style={[styles.row, { marginTop: space.md, gap: space.md }]}>
      <View style={[styles.fill, { gap: space.xxs }]}>
        {eyebrow ? (
          <Text variant="label" tone="accent">
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="title1" accessibilityRole="header">
          {title}
        </Text>
      </View>
      <Pressable
        onPress={() => router.push("/painter/profile")}
        accessibilityRole="button"
        accessibilityLabel={t("painter.yourProfile")}
        hitSlop={8}
        testID="painter-avatar"
      >
        <Avatar name={givenName(profile)} />
      </Pressable>
    </View>
  );
}

/** "Hello, Ramesh" — or "Your account" while the name is still the stand-in one. */
export function painterGreeting(name: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? t("painter.hello", { name: first }) : t("painter.yourAccount");
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end" },
  fill: { flex: 1 },
});
