import { StyleSheet, View } from "react-native";

import type { ProjectSummary } from "@/api/types";
import { Card, RemoteImage, Text } from "@/components/ui";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

import { daysLeft, roomChip, roomChipLabel, type RoomChip } from "./room-status";

/** "3 days left" / "Closes today" / null. */
export function daysLeftText(room: ProjectSummary): string | null {
  const left = daysLeft(room);
  return left === null ? null : left === 0 ? t("time.closesToday") : left === 1 ? t("time.oneDayLeft") : t("time.daysLeft", { n: left });
}

/** The room's one status chip, and the days left beside it (under 3 days in warm text). */
export function RoomStatus({ room }: { room: ProjectSummary }) {
  const { colors, radius } = useTheme();
  const chip: RoomChip = roomChip(room);
  const left = daysLeft(room);
  const leftText = daysLeftText(room);
  return (
    <View style={styles.meta}>
      <View
        style={[
          styles.chip,
          {
            borderRadius: radius.pill,
            backgroundColor: chip === "ready" ? colors.accentSoft + "26" : colors.surfaceSoft,
            borderColor: chip === "ready" ? colors.ruleBrass : colors.rule,
          },
        ]}
      >
        <Text variant="caption" style={{ color: chip === "failed" ? colors.dangerText : colors.fgSoft }}>
          {t(roomChipLabel[chip])}
        </Text>
      </View>
      {leftText ? (
        <Text variant="caption" style={{ color: left !== null && left <= 3 ? colors.warmText : colors.fgMute }}>
          {leftText}
        </Text>
      ) : null}
    </View>
  );
}

/** A room in a strip or a list: photo, name, its one status chip, and days left. */
export function RoomCard({ room, width, onPress }: { room: ProjectSummary; width?: number; onPress: () => void }) {
  const { space } = useTheme();
  const chip = roomChip(room);
  const name = room.name?.trim() || t("rooms.untitled");
  const leftText = daysLeftText(room);
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[name, t(roomChipLabel[chip]), leftText].filter(Boolean).join(", ")}
      style={[{ padding: 0, overflow: "hidden" }, width ? { width } : null]}
    >
      <RemoteImage url={room.cleanedImageUrl || room.imageUrl} style={styles.photo} />
      <View style={{ padding: space.sm, gap: space.xxs }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        <RoomStatus room={room} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", aspectRatio: 4 / 3 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
});
