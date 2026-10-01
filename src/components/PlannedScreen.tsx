import Feather from "@expo/vector-icons/Feather";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { Button, Card, Screen, Text } from "@/components/ui";
import { t } from "@/i18n";
import { screens, type ScreenId } from "@/navigation/screens";
import { useTheme } from "@/theme";

/**
 * Stands in for a screen that is planned but not built yet. It shows the screen's ID,
 * purpose and spec, the params it was opened with, and buttons to the screens it leads
 * to — so the whole app can be walked before any screen exists.
 *
 * Replace each <PlannedScreen id="…" /> with the real screen as it is built
 * (docs/08-roadmap.md), and set its status in src/navigation/screens.ts.
 */
export function PlannedScreen({ id, tab = false }: { id: ScreenId; tab?: boolean }) {
  const info = screens[id];
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors, space } = useTheme();
  const paramEntries = Object.entries(params).filter(([, v]) => v !== undefined);
  const next = (info as { next?: readonly string[] }).next ?? [];

  return (
    <Screen scroll edges={tab ? ["top"] : ["top", "bottom"]}>
      <View style={[styles.header, { marginTop: space.xs }]}>
        {!tab && router.canGoBack() ? (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            hitSlop={12}
            style={styles.back}
          >
            <Feather name="arrow-left" size={22} color={colors.fg} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ gap: space.sm, marginTop: space.lg }}>
        <Text variant="label" tone="accent">
          {t("planned.eyebrow", { id, phase: info.phase })}
        </Text>
        <Text variant="title1">{info.title}</Text>
        <Text tone="soft">{info.summary}</Text>
      </View>

      <Card style={{ marginTop: space.xl }}>
        <Text variant="bodyStrong">{t("planned.notBuilt")}</Text>
        <Text variant="small" tone="mute">
          {t("planned.spec", { spec: `docs/${info.spec} — ${id}` })}
        </Text>
        {paramEntries.length ? (
          <Text variant="small" tone="mute">
            {t("planned.params")}: {paramEntries.map(([k, v]) => `${k}=${String(v)}`).join(", ")}
          </Text>
        ) : null}
      </Card>

      {next.length ? (
        <View style={{ gap: space.xs, marginTop: space.xl }}>
          <Text variant="label" tone="mute">
            {t("planned.goesTo")}
          </Text>
          {next.map((target) => {
            const dest = screens[target as ScreenId];
            if (!dest) return null;
            return (
              <Button
                key={target}
                variant="secondary"
                label={`${target} · ${dest.title}`}
                onPress={() => router.push(dest.href as Href)}
              />
            );
          })}
        </View>
      ) : null}

      {__DEV__ ? (
        <View style={{ marginTop: space.xxl }}>
          <Button variant="ghost" icon="list" label={t("dev.title")} onPress={() => router.push("/dev")} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 32, flexDirection: "row", alignItems: "center" },
  back: { width: 48, height: 48, justifyContent: "center", marginLeft: -12, paddingLeft: 12 },
});
