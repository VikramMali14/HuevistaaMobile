import { StyleSheet, View } from "react-native";

import type { ProjectSummary } from "@/api/types";
import { Card, RemoteImage, Text } from "@/components/ui";
import { t } from "@/i18n";
import { formatDate } from "@/lib/dates";
import { useTheme } from "@/theme";

import { daysLeftText, RoomStatus } from "./RoomCard";
import { roomChip, roomChipLabel } from "./room-status";

/** A room in the Studio list (C2): photo, name, when it last changed, its status chip. */
export function StudioRoomRow({ room, onPress, onLongPress }: { room: ProjectSummary; onPress: () => void; onLongPress: () => void }) {
  const { radius, space } = useTheme();
  const name = room.name?.trim() || t("rooms.untitled");
  const updated = room.updatedAt ?? room.createdAt;
  return (
    <Card
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={[name, t(roomChipLabel[roomChip(room)]), daysLeftText(room)].filter(Boolean).join(", ")}
      accessibilityHint={t("studio.menuHint")}
      style={{ padding: space.sm }}
    >
      <View style={styles.row}>
        <RemoteImage url={room.cleanedImageUrl || room.imageUrl} style={[styles.photo, { borderRadius: radius.sm }]} />
        <View style={{ flex: 1, gap: space.xxs }}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {name}
          </Text>
          {updated ? (
            <Text variant="caption" tone="mute">
              {t("studio.updated", { date: formatDate(updated) })}
            </Text>
          ) : null}
          <RoomStatus room={room} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  photo: { width: 96, height: 72 },
});
