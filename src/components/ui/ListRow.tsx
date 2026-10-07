import Feather from "@expo/vector-icons/Feather";
import { Children, Fragment, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { hairline, useTheme } from "@/theme";

import { Text } from "./Text";

export interface ListRowProps {
  title: string;
  /** A second line under the title. */
  detail?: string;
  /** On the right, before the chevron: "Verified", "English". */
  value?: string;
  icon?: ComponentProps<typeof Feather>["name"];
  onPress?: () => void;
  /** Press and hold (a hidden extra, like Settings' version opening the live-colour check). */
  onLongPress?: () => void;
  /** `danger` for a destructive row — Delete account, Sign out. */
  tone?: "default" | "danger";
  /** Working on it: a spinner in place of the chevron, and presses ignored. */
  busy?: boolean;
  testID?: string;
}

/** One row of a grouped list: icon, title (and detail), value, chevron. */
export function ListRow({ title, detail, value, icon, onPress, onLongPress, tone = "default", busy = false, testID }: ListRowProps) {
  const { colors, space } = useTheme();
  const ink = tone === "danger" ? colors.dangerText : colors.fg;
  const body = (
    <>
      {icon ? <Feather name={icon} size={20} color={tone === "danger" ? colors.dangerText : colors.fgSoft} /> : null}
      <View style={styles.text}>
        <Text variant="body" style={{ color: ink }}>
          {title}
        </Text>
        {detail ? (
          <Text variant="small" tone="mute">
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="small" tone="mute" numberOfLines={2} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {busy ? (
        <ActivityIndicator size="small" color={colors.fgMute} />
      ) : onPress ? (
        <Feather name="chevron-right" size={18} color={colors.fgMute} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, { paddingHorizontal: space.md, gap: space.sm }]}>{body}</View>;
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={busy ? { busy: true, disabled: true } : undefined}
      accessibilityLabel={value ? `${title}, ${value}` : title}
      style={({ pressed }) => [
        styles.row,
        { paddingHorizontal: space.md, gap: space.sm, backgroundColor: pressed ? colors.surfaceSoft : "transparent" },
      ]}
    >
      {body}
    </Pressable>
  );
}

/** Rows on one surface, split by hairlines, with an optional heading above. */
export function ListGroup({ title, children }: { title?: string; children: ReactNode }) {
  const { colors, radius, space } = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: space.xs }}>
      {title ? (
        <Text variant="label" tone="mute" accessibilityRole="header" style={{ paddingHorizontal: space.xxs }}>
          {title}
        </Text>
      ) : null}
      <View
        style={[
          styles.group,
          { backgroundColor: colors.surface, borderColor: colors.rule, borderRadius: radius.md },
        ]}
      >
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <View style={[styles.rule, { backgroundColor: colors.rule, marginLeft: space.md }]} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  text: { flex: 1, gap: 2 },
  value: { maxWidth: "55%", textAlign: "right" },
  group: { borderWidth: hairline, overflow: "hidden" },
  rule: { height: hairline },
});
