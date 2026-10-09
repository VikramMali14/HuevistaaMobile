import { StyleSheet, View } from "react-native";

import type { SupportMessage } from "@/api/endpoints/support";
import { Text } from "@/components/ui";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

import { senderName } from "./support";

/**
 * One message in a support chat (S7), as the website draws it: yours on the right in
 * brass; the assistant's and the team's on the left, each named; the system's notes small
 * in the middle. Plain text with its line breaks — never markdown or HTML.
 */
export function Bubble({ message, pending }: { message: Pick<SupportMessage, "sender" | "body">; pending?: boolean }) {
  const { colors, radius, space } = useTheme();
  const { sender, body } = message;

  if (sender === "SYSTEM") {
    return (
      <Text variant="caption" tone="mute" align="center" style={styles.system} accessibilityLiveRegion="polite">
        {body}
      </Text>
    );
  }

  const mine = sender === "USER";
  const who = senderName(sender);
  return (
    <View
      style={[styles.wrap, mine ? styles.right : styles.left]}
      accessible
      accessibilityLabel={pending && mine ? `${who}: ${body}. ${t("help.sending")}` : `${who}: ${body}`}
      testID={pending ? "bubble-pending" : undefined}
    >
      {mine ? null : (
        <Text variant="label" tone={sender === "AGENT" ? "accent" : "mute"} style={{ marginBottom: space.xxs }}>
          {who}
        </Text>
      )}
      <View
        style={[
          styles.bubble,
          {
            borderRadius: radius.lg,
            backgroundColor: mine ? colors.accent : colors.surface,
            borderColor: mine ? colors.accent : colors.rule,
          },
        ]}
      >
        <Text variant="body" style={{ color: mine ? colors.accentOn : pending ? colors.fgMute : colors.fg }} selectable>
          {body}
        </Text>
      </View>
      {pending && mine ? (
        <Text variant="caption" tone="mute" align="right" style={{ marginTop: space.xxs }}>
          {t("help.sending")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { maxWidth: "86%" },
  left: { alignSelf: "flex-start" },
  right: { alignSelf: "flex-end" },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth },
  system: { alignSelf: "center", maxWidth: "90%", paddingVertical: 4 },
});
