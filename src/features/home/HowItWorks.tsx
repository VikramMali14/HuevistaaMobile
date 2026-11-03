import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "@/components/ui";
import { t, type MessageKey } from "@/i18n";
import { fonts, hairline, useTheme } from "@/theme";

type IconName = ComponentProps<typeof Feather>["name"];

const STEPS: { icon: IconName; text: MessageKey }[] = [
  { icon: "camera", text: "home.how.photo" },
  { icon: "droplet", text: "home.how.colour" },
  { icon: "shopping-bag", text: "home.how.shop" },
];

/**
 * How the app works, in three pictures: a photo of the wall, a colour tapped on it, the
 * colour's code shown at the paint shop. The website's home page has the same three
 * (HueVistaFrontEnd components/app/customer-home.tsx).
 *
 * The one thing a newcomer cannot work out from the buttons is the ORDER, and a customer
 * may read slowly or read little English — so each step is a picture with its number on
 * it, and one short line. It stays for a customer who has been before: it is three rows,
 * and the answer to "what was I meant to do next?".
 */
export function HowItWorks() {
  const { colors, radius, space } = useTheme();
  return (
    <View style={{ gap: space.xs }} testID="how-it-works">
      <Text variant="title3" accessibilityRole="header">
        {t("home.how.title")}
      </Text>
      {STEPS.map((step, i) => (
        <View
          key={step.text}
          accessible
          accessibilityLabel={t("home.how.step", { n: i + 1, text: t(step.text) })}
          style={[
            styles.step,
            { backgroundColor: colors.surface, borderColor: colors.rule, borderRadius: radius.md, padding: space.sm, gap: space.sm },
          ]}
        >
          <View style={[styles.pic, { borderColor: colors.ruleBrass, backgroundColor: colors.surfaceSoft }]}>
            <Feather name={step.icon} size={24} color={colors.accentText} />
            <View style={[styles.n, { backgroundColor: colors.accent }]}>
              <Text style={[styles.nText, { color: colors.accentOn }]}>{i + 1}</Text>
            </View>
          </View>
          <Text variant="bodyStrong" style={styles.text}>
            {t(step.text)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", alignItems: "center", borderWidth: hairline },
  pic: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  // The step's number on the picture's shoulder: the order is the point of the list.
  n: {
    position: "absolute",
    top: -5,
    left: -5,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  nText: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 15 },
  text: { flex: 1 },
});
