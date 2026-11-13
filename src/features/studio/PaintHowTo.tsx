import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Disclaimer, Sheet, Text } from "@/components/ui";
import { t } from "@/i18n";
import { fonts, useTheme } from "@/theme";

import { StepNumber } from "./StepNumber";

const SEEN_KEY = "hv.paintHowTo";

/**
 * Whether this phone has been shown how Paint works.
 *
 * A storage error answers "yes": the sheet is help, and a phone that cannot remember
 * having shown it would otherwise show it every time Paint opens. The Help button in
 * the top bar opens it whenever it is wanted.
 */
export async function paintHowToSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) === "1";
  } catch {
    return true;
  }
}

export async function markPaintHowToSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Only a convenience: it is shown once more next time.
  }
}

/**
 * How Paint works, in three pictures — the first thing Paint shows on a new phone, and
 * what the Help button opens after that.
 *
 * Each step is a number, a picture of the thing to press, and a few words, in that
 * order of size: somebody who reads none of the words still leaves with "one, two,
 * three" and what each looks like, and the same three numbers are waiting in the dock
 * behind the sheet. One button. The shade disclaimer closes the sheet, where Paint's ⓘ
 * used to keep it: everybody reads it once on the way in, instead of only the few who
 * thought to press an ⓘ.
 */
export function PaintHowTo({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { space } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={t("paint.howTitle")} testID="paint-howto">
      <View style={{ gap: space.md }}>
        <HowStep n={1} art={<WallArt />} title={t("paint.how1Title")} text={t("paint.how1Text")} />
        <HowStep n={2} art={<ColourArt />} title={t("paint.how2Title")} text={t("paint.how2Text")} />
        <HowStep n={3} art={<SaveArt />} title={t("paint.how3Title")} text={t("paint.how3Text")} />
      </View>
      <Button label={t("paint.howStart")} onPress={onClose} testID="paint-howto-start" />
      <Disclaimer kind="shades" />
    </Sheet>
  );
}

function HowStep({ n, art, title, text }: { n: number; art: ReactNode; title: string; text: string }) {
  return (
    <View style={styles.step} accessible accessibilityLabel={`${n}. ${title}. ${text}`}>
      <StepNumber n={n} style={styles.stepNumber} />
      <View style={styles.art}>{art}</View>
      <View style={styles.words}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="small" tone="soft">
          {text}
        </Text>
      </View>
    </View>
  );
}

/** Where a finger lands: a dot, and a ring round it. */
function Tap({ x, y }: { x: number; y: number }) {
  const { colors } = useTheme();
  return (
    <>
      <View style={[styles.tapRing, { left: x - 10, top: y - 10, borderColor: colors.fg }]} />
      <View style={[styles.tapDot, { left: x - 4, top: y - 4, backgroundColor: colors.fg }]} />
    </>
  );
}

/** A room's corner — two walls, one of them coloured — and a tap on it. */
function WallArt() {
  const { colors } = useTheme();
  return (
    <View style={styles.canvas}>
      <View style={[styles.wall, { borderColor: colors.fg }]}>
        <View style={[styles.wallHalf, { backgroundColor: colors.surfaceSoft }]} />
        <View style={[styles.wallHalf, { backgroundColor: "#d9a48c", borderLeftWidth: 2, borderLeftColor: colors.fg }]} />
      </View>
      <Tap x={38} y={28} />
    </View>
  );
}

/** Four colours, one of them pressed. */
function ColourArt() {
  const { colors } = useTheme();
  const tile = (bg: string) => <View style={[styles.tile, { backgroundColor: bg, borderColor: colors.fg }]} />;
  return (
    <View style={styles.canvas}>
      <View style={styles.tiles}>
        {tile("#eecb4a")}
        {tile("#5f9460")}
        {tile("#4d7fbf")}
        {tile("#d9a48c")}
      </View>
      <Tap x={41} y={41} />
    </View>
  );
}

/** A colour board with the room's colours on it, and the plus that keeps them. */
function SaveArt() {
  const { colors } = useTheme();
  return (
    <View style={styles.canvas}>
      <View style={[styles.sheet, { backgroundColor: colors.surfaceSoft, borderColor: colors.fg }]}>
        <View style={styles.sheetRow}>
          <View style={[styles.chip, { backgroundColor: "#d9a48c", borderColor: colors.fg }]} />
          <View style={[styles.chip, { backgroundColor: "#5f9460", borderColor: colors.fg }]} />
        </View>
        <View style={[styles.line, { backgroundColor: colors.fg }]} />
      </View>
      <View style={[styles.plus, { backgroundColor: colors.accent, borderColor: colors.fg }]}>
        <Text maxFontSizeMultiplier={1} style={[styles.plusText, { color: colors.accentOn }]}>
          +
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepNumber: { width: 30, height: 30, borderRadius: 15 },
  art: { width: 56, height: 56 },
  words: { flex: 1, gap: 2 },
  canvas: { width: 56, height: 56 },
  wall: { position: "absolute", left: 4, top: 6, width: 48, height: 44, borderWidth: 2, borderRadius: 6, overflow: "hidden", flexDirection: "row" },
  wallHalf: { flex: 1 },
  tapRing: { position: "absolute", width: 20, height: 20, borderRadius: 10, borderWidth: 2, opacity: 0.55 },
  tapDot: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
  tiles: { position: "absolute", left: 5, top: 5, width: 46, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tile: { width: 20, height: 20, borderRadius: 4, borderWidth: 2 },
  sheet: { position: "absolute", left: 8, top: 4, width: 34, height: 44, borderRadius: 4, borderWidth: 2, padding: 5, gap: 6 },
  sheetRow: { flexDirection: "row", gap: 4 },
  chip: { width: 9, height: 9, borderRadius: 2, borderWidth: 1.5 },
  line: { height: 2, borderRadius: 1, width: 18 },
  plus: { position: "absolute", right: 2, bottom: 2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  plusText: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 18 },
});
