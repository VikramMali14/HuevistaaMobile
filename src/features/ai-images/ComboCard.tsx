import { StyleSheet, View } from "react-native";

import type { ProjectCombo } from "@/api/types";
import { Card, Text } from "@/components/ui";
import { comboCode, comboWords, optionName } from "@/features/boards/combos";
import { t } from "@/i18n";
import { hairline, useTheme } from "@/theme";

/**
 * One option from a room's colour board (C22, C23): its colours side by side, then each wall
 * with its code. Two options can share a name across boards, so the swatches always show.
 */
export function ComboCard({
  combo,
  board,
  badge,
  onPress,
  testID,
}: {
  combo: ProjectCombo;
  /** "Board 2", when the room has taken more than one. */
  board?: string | null;
  /** "AI image made". */
  badge?: string | null;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors, radius, space } = useTheme();
  const name = optionName(combo);
  return (
    <Card onPress={onPress} accessibilityLabel={onPress ? t("aiImage.optionLabel", { option: name, shades: comboWords(combo) }) : undefined}>
      <View style={{ gap: space.sm }} testID={testID}>
        <View style={styles.row}>
          <Text variant="label" tone="accent" style={styles.fill}>
            {board ? `${board} · ${name}` : name}
          </Text>
          {badge ? (
            <Text variant="caption" tone="mute">
              {badge}
            </Text>
          ) : null}
        </View>
        <View style={[styles.strip, { borderRadius: radius.sm, borderColor: colors.ruleStrong }]}>
          {combo.shades.map((shade, i) => (
            <View key={`${shade.regionId ?? i}`} style={[styles.fill, { backgroundColor: shade.hex }]} />
          ))}
        </View>
        {combo.shades.map((shade, i) => {
          const code = comboCode(shade);
          return (
            <View key={`${shade.regionId ?? i}`} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: shade.hex, borderColor: colors.ruleStrong, borderRadius: radius.xs }]} />
              <Text variant="small" tone="soft" style={styles.fill} numberOfLines={1}>
                {shade.regionLabel?.trim() || t("aiImage.wall")}
                {shade.shadeName ? ` · ${shade.shadeName}` : ""}
              </Text>
              {code ? (
                <Text variant="bodyStrong" tone="soft">
                  {code}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  strip: { flexDirection: "row", height: 28, overflow: "hidden", borderWidth: hairline },
  dot: { width: 22, height: 16, borderWidth: hairline },
});
