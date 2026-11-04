import { useQuery } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { launchesApi } from "@/api/endpoints/launches";
import { keys } from "@/api/query-keys";
import { RemoteImage, SectionHeader, Text } from "@/components/ui";
import { t } from "@/i18n";
import { openWebPage } from "@/lib/open-web";
import { hairline, useTheme } from "@/theme";

/** As many as Home shows; the rest are a press away on the website's list. */
const SHOWN = 6;

/**
 * New launches — other makers' new products — first thing on Home, as on the website's
 * signed-in home page (HueVistaFrontEnd components/app/dashboard-launches.tsx).
 *
 * A row of cards, each the product's photo, its name, its line and its maker, that opens the
 * launch's own page on the website. Nothing at all while it loads, when none is on, or when
 * the list could not be read: an empty shelf at the top of Home says nothing worth the space.
 * Labelled a partner promotion, as every launch is: what is said about a product is its maker's.
 */
export function NewLaunches() {
  const { colors, radius, space } = useTheme();
  const launches = useQuery({ queryKey: keys.launches, queryFn: launchesApi.list, staleTime: 5 * 60_000 });
  const live = launches.data ?? [];
  if (live.length === 0) return null;

  return (
    <View style={{ gap: space.sm }} testID="home-launches">
      <SectionHeader
        title={t("launches.title")}
        lead={t("launches.note")}
        actionLabel={t("home.seeAll")}
        onAction={() => void openWebPage("/launches")}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.gutter }}
        style={{ marginHorizontal: -space.gutter }}
      >
        {live.slice(0, SHOWN).map((l) => (
          <Pressable
            key={l.slug}
            testID={`launch-${l.slug}`}
            onPress={() => void openWebPage(`/launches/${encodeURIComponent(l.slug)}`)}
            accessibilityRole="button"
            accessibilityLabel={`${t("launches.new")}: ${l.name}. ${l.tagline}. ${t("launches.by", { maker: l.company.name })}`}
            style={({ pressed }) => [
              styles.card,
              {
                borderRadius: radius.md,
                borderColor: colors.rule,
                backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
                padding: space.sm,
                gap: space.sm,
              },
            ]}
          >
            <RemoteImage url={l.packshot} style={[styles.pic, { borderRadius: radius.sm }]} accessibilityLabel={l.packshotAlt} />
            <View style={styles.text}>
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text variant="caption" style={{ color: colors.accentOn, fontWeight: "700" }}>
                  {t("launches.new")}
                </Text>
              </View>
              <Text variant="bodyStrong" numberOfLines={2}>
                {l.name}
              </Text>
              <Text variant="small" tone="mute" numberOfLines={2}>
                {l.tagline}
              </Text>
              <Text variant="caption" tone="mute" numberOfLines={1}>
                {t("launches.by", { maker: l.company.name })}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 280, flexDirection: "row", alignItems: "center", borderWidth: hairline },
  pic: { width: 84, height: 84 },
  text: { flex: 1, gap: 3, alignItems: "flex-start" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
});
