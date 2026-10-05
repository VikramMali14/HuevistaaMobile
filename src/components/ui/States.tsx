import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";

import { messageFor } from "@/api/errors";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

import { Button } from "./Button";
import { Text } from "./Text";

type IconName = ComponentProps<typeof Feather>["name"];

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  /** One sentence: what this place is for. */
  body?: string;
  /** The one action that fills it. */
  actionLabel?: string;
  onAction?: () => void;
}

/** What an empty place is for, and the one thing that fills it. */
export function EmptyState({ icon = "inbox", title, body, actionLabel, onAction }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <Feather name={icon} size={36} color={colors.fgMute} />
      <Text variant="title3" align="center">
        {title}
      </Text>
      {body ? (
        <Text tone="soft" align="center">
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} block={false} /> : null}
    </View>
  );
}

export interface ErrorStateProps {
  /** The failure — turned into a plain sentence (never a raw message or status code). */
  error?: unknown;
  /** Overrides the sentence worked out from `error`. */
  message?: string;
  onRetry?: () => void;
  onHelp?: () => void;
}

/** X2: what went wrong in plain words, Retry, and a way to get help. */
export function ErrorState({ error, message, onRetry, onHelp }: ErrorStateProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <Feather name="cloud-off" size={36} color={colors.fgMute} />
      <Text align="center">{message ?? messageFor(error)}</Text>
      <View style={styles.actions}>
        {onRetry ? <Button label={t("common.retry")} onPress={onRetry} block={false} /> : null}
        {onHelp ? (
          <Button label={t("common.getHelp")} onPress={onHelp} variant="ghost" block={false} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
});
