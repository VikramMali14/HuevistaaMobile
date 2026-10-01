import { Redirect, useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import type { UserRole } from "@/api/types";
import { useSession } from "@/auth/session";
import { Button, Screen, Text } from "@/components/ui";
import { t } from "@/i18n";
import { areaOrder, screens, type ScreenArea, type ScreenInfo } from "@/navigation/screens";
import { hairline, useTheme } from "@/theme";

const areaTitle: Record<ScreenArea, string> = {
  auth: "Signing in",
  onboarding: "First run",
  customer: "Customer",
  painter: "Painter",
  account: "Account (both roles)",
  links: "Links from outside",
};

const roles: { role: UserRole | null; label: string }[] = [
  { role: null, label: t("dev.signedOut") },
  { role: "CUSTOMER", label: t("dev.customer") },
  { role: "PAINTER", label: t("dev.painter") },
  { role: "RETAILER", label: t("dev.shop") },
];

/**
 * Development only: every planned screen, grouped, with its build status — and a way to
 * preview a role without a backend so the role-guarded screens can be opened. Never
 * reachable in a release build.
 */
export default function DevScreens() {
  const router = useRouter();
  const { state, previewAs } = useSession();
  const { colors, space, radius } = useTheme();

  if (!__DEV__) return <Redirect href="/" />;

  const current = state.status === "signedIn" ? state.profile.role : null;
  const entries = Object.entries(screens) as [string, ScreenInfo][];
  const built = entries.filter(([, s]) => s.status === "built").length;

  return (
    <Screen scroll>
      <View style={{ gap: space.sm, marginTop: space.lg }}>
        <Text variant="title1">{t("dev.title")}</Text>
        <Text tone="soft">{t("dev.intro")}</Text>
        <Text variant="small" tone="mute">
          {built} {t("dev.built")} · {entries.length - built} {t("dev.planned")}
        </Text>
      </View>

      <Text variant="label" tone="mute" style={{ marginTop: space.xl }}>
        {t("dev.previewAs")}
      </Text>
      <View style={[styles.row, { gap: space.xs, marginTop: space.xs }]}>
        {roles.map(({ role, label }) => (
          <Button
            key={label}
            label={label}
            block={false}
            variant={current === role ? "primary" : "secondary"}
            onPress={() => previewAs(role)}
          />
        ))}
      </View>

      {areaOrder.map((area) => (
        <View key={area} style={{ marginTop: space.xl, gap: space.xs }}>
          <Text variant="title3">{areaTitle[area]}</Text>
          {entries
            .filter(([, s]) => s.area === area)
            .map(([id, s]) => (
              <Pressable
                key={id}
                onPress={() => router.push(s.href as Href)}
                accessibilityRole="button"
                accessibilityLabel={`${id} ${s.title}`}
                style={({ pressed }) => [
                  styles.item,
                  {
                    borderColor: colors.rule,
                    borderRadius: radius.sm,
                    backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
                  },
                ]}
              >
                <Text variant="code" style={styles.id}>
                  {id}
                </Text>
                <View style={styles.itemText}>
                  <Text variant="bodyStrong">{s.title}</Text>
                  <Text variant="caption" tone="mute">
                    Phase {s.phase} · {s.status === "built" ? t("dev.built") : t("dev.planned")}
                  </Text>
                </View>
              </Pressable>
            ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    minHeight: 56,
    borderWidth: hairline,
  },
  id: { width: 52, fontSize: 16 },
  itemText: { flex: 1 },
});
