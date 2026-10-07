import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { t } from "@/i18n";
import { useTheme } from "@/theme";

import { Button } from "./Button";
import { Text } from "./Text";

/** "0:42" — minutes and seconds. */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface WorkingStateProps {
  /** "Clearing the clutter". */
  stage: string;
  /** What this stage does, in a plain sentence — or the server's own progress note. */
  sentence: string;
  /** An honest estimate: "About 20 seconds". */
  estimate?: string;
  /** When the job started (ms since epoch), for the elapsed time. */
  startedAt: number;
  /** "Leave this running": the job carries on on the server. */
  onLeave?: () => void;
}

/** The AI working pattern (docs/02): stage, sentence, estimate, elapsed time, leave it running. */
export function WorkingState({ stage, sentence, estimate, startedAt, onLeave }: WorkingStateProps) {
  const { colors, space } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <View style={{ gap: space.sm }}>
      {/* Announced when the stage or its sentence changes — not the clock, every second. */}
      <View style={{ gap: space.sm }} accessibilityLiveRegion="polite">
        <View style={styles.head}>
          <ActivityIndicator color={colors.accentText} />
          <Text variant="title3" accessibilityRole="header" style={{ flex: 1 }}>
            {stage}
          </Text>
        </View>
        <Text variant="body" tone="soft">
          {sentence}
        </Text>
      </View>
      <Text variant="small" tone="mute">
        {[estimate, t("working.elapsed", { time: formatElapsed((now - startedAt) / 1000) })].filter(Boolean).join(" · ")}
      </Text>
      {onLeave ? <Button variant="ghost" block={false} label={t("working.leave")} onPress={onLeave} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
});
