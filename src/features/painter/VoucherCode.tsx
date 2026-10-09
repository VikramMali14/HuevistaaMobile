import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet } from "react-native";

import { Text, useToast } from "@/components/ui";
import { t } from "@/i18n";
import { fonts, useTheme } from "@/theme";

/**
 * A voucher's code drawn large enough to read at arm's length (P10, P11): tabular figures,
 * wide tracking, never wrapped mid-code. A long press copies it — said, and felt lightly.
 */
export function VoucherCode({ code, size = "large" }: { code: string; size?: "large" | "medium" }) {
  const { colors } = useTheme();
  const toast = useToast();
  const copy = async () => {
    await Clipboard.setStringAsync(code).catch(() => {});
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    toast.show(t("painter.voucher.copied"), "success");
  };
  const big = size === "large";
  return (
    <Pressable
      onLongPress={() => void copy()}
      accessibilityRole="text"
      accessibilityLabel={`${t("painter.voucher.code")}: ${code.split("").join(" ")}`}
      accessibilityHint={t("painter.voucher.copy")}
      testID="voucher-code"
    >
      <Text
        style={[styles.code, { color: colors.fg, fontSize: big ? 34 : 24, lineHeight: big ? 42 : 30, letterSpacing: big ? 3 : 2 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.3}
      >
        {code}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  code: { fontFamily: fonts.bold, fontVariant: ["tabular-nums"], textAlign: "center" },
});
