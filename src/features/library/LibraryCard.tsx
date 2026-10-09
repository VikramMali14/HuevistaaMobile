import { StyleSheet, View } from "react-native";

import type { FreeProject } from "@/api/types";
import { Card, RemoteImage, Text } from "@/components/ui";
import { t } from "@/i18n";
import { hairline, useTheme } from "@/theme";

/** A ready-made room: its photo, name, and the colours it was painted in. */
export function LibraryCard({ room, width, onPress }: { room: FreeProject; width?: number; onPress: () => void }) {
  const { colors, space } = useTheme();
  const colours = (room.colours ?? []).filter((c) => c?.hex).slice(0, 5);
  const walls = room.wallCount === 1 ? t("library.oneWall") : t("library.walls", { n: room.wallCount });
  return (
    <Card
      testID={`library-card-${room.slug}`}
      onPress={onPress}
      accessibilityLabel={[room.title, room.roomLabel, walls].filter(Boolean).join(", ")}
      style={[{ padding: 0, overflow: "hidden" }, width ? { width } : null]}
    >
      <RemoteImage url={room.imageUrl} style={styles.photo} />
      <View style={{ padding: space.sm, gap: space.xxs }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {room.title}
        </Text>
        <View style={styles.meta}>
          <Text variant="caption" tone="mute" numberOfLines={1} style={styles.label}>
            {[room.roomLabel, walls].filter(Boolean).join(" · ")}
          </Text>
          <View style={styles.dots}>
            {colours.map((c, i) => (
              <View key={`${c.hex}${i}`} style={[styles.dot, { backgroundColor: c.hex, borderColor: colors.ruleStrong }]} />
            ))}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", aspectRatio: 4 / 3 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { flex: 1 },
  dots: { flexDirection: "row", gap: 3 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: hairline },
});
