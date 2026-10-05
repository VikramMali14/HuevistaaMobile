import { StyleSheet, View } from "react-native";

import { Button } from "./Button";
import { Text } from "./Text";

/** A section's title, with an optional "See all" on the right. */
export function SectionHeader({
  title,
  lead,
  actionLabel,
  onAction,
}: {
  title: string;
  lead?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="title3" accessibilityRole="header">
          {title}
        </Text>
        {lead ? (
          <Text variant="small" tone="mute">
            {lead}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button variant="ghost" block={false} label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  text: { flex: 1, gap: 2 },
  action: { marginRight: -12 },
});
