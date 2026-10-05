import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { hairline, useTheme } from "@/theme";

import { Text } from "./Text";

export interface ChoiceCardProps {
  title: string;
  body?: string;
  selected: boolean;
  onPress: () => void;
  icon?: ComponentProps<typeof Feather>["name"];
  testID?: string;
}

/**
 * One of a few large choices (A10's "painting my home" / "paint for a living", the
 * studio's clean-up options). Chosen = a brass ring and a tick — never colour alone.
 */
export function ChoiceCard({ title, body, selected, onPress, icon, testID }: ChoiceCardProps) {
  const { colors, radius, space } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={body ? `${title}. ${body}` : title}
      style={({ pressed }) => [
        styles.card,
        {
          borderRadius: radius.md,
          padding: space.lg,
          backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
          borderColor: selected ? colors.accent : colors.rule,
          borderWidth: selected ? 2 : hairline,
          // Keep the content still when the ring thickens.
          margin: selected ? 0 : 2 - hairline,
        },
      ]}
    >
      {icon ? <Feather name={icon} size={22} color={selected ? colors.accentText : colors.fgSoft} /> : null}
      <View style={styles.text}>
        <Text variant="title3">{title}</Text>
        {body ? (
          <Text variant="small" tone="soft">
            {body}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.tick,
          {
            borderColor: selected ? colors.accent : colors.ruleStrong,
            backgroundColor: selected ? colors.accent : "transparent",
          },
        ]}
      >
        {selected ? <Feather name="check" size={14} color={colors.accentOn} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14 },
  text: { flex: 1, gap: 4 },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
