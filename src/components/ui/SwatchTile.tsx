import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { hairline, useTheme } from "@/theme";

import { Text } from "./Text";

export interface SwatchTileProps {
  hex: string;
  /** The code to print — already chosen through displayCodeOf(). */
  code: string;
  /** Only when this viewer may see names, and the shade has one. */
  name?: string | null;
  width: number;
  onPress?: () => void;
  accessibilityLabel: string;
}

/**
 * One shade in a grid: the colour, then its code. Fixed size and memoised — the
 * catalogue lays out thousands of these.
 */
export const SwatchTile = memo(function SwatchTile({ hex, code, name, width, onPress, accessibilityLabel }: SwatchTileProps) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.75 : 1 }]}
    >
      <View
        style={[
          styles.colour,
          { backgroundColor: hex, borderRadius: radius.sm, borderColor: colors.rule, height: width },
        ]}
      />
      <Text variant="code" style={styles.code} numberOfLines={1}>
        {code}
      </Text>
      {name ? (
        <Text variant="caption" tone="mute" numberOfLines={1}>
          {name}
        </Text>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  colour: { borderWidth: hairline },
  code: { fontSize: 13, lineHeight: 18, marginTop: 6 },
});
