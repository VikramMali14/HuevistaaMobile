import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Skeleton, Text } from "@/components/ui";
import { familiesPresent, filterShades, NO_FILTER } from "@/features/catalogue/filter";
import { namesShown, shownName, useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { useRecentShades, type WallColour } from "@/features/studio/paint-store";
import { shadeColour } from "@/features/studio/shade-colour";
import type { SuggestedColour } from "@/features/studio/suggested-swatches";
import { t, type MessageKey } from "@/i18n";
import type { ParentFamily } from "@/lib/colour-families";
import { hairline, useTheme } from "@/theme";

import { StepNumber } from "./StepNumber";

const SWATCH = 40;
const GAP = 8;
const ROWS = 2;
/** The swatch strip's height, whatever is in it: the canvas above must keep its size. */
export const PALETTE_STRIP_HEIGHT = SWATCH * ROWS + GAP * (ROWS - 1);

/** A colour family's dot, and the ring round the chosen one. */
const DOT = 32;
const RING = DOT + 8;

/**
 * How each colour family looks as a dot: one colour, or two for the families that hold
 * two, and a wheel of them for All. The same dots the website's studio uses.
 */
const FAMILY_LOOK: Record<ParentFamily | "all", readonly [string, ...string[]]> = {
  all: ["#d8504a", "#f0a23a", "#f2d64b", "#62a862", "#4f86c6", "#8a6bb8"],
  Whites: ["#f7f4ed"],
  Neutrals: ["#dccbb0"],
  "Greys & blacks": ["#a3a3a3", "#2c2c2c"],
  "Reds & pinks": ["#c9403a", "#eaa0b0"],
  "Oranges & browns": ["#e3852f", "#8a5a36"],
  "Yellows & golds": ["#eecb4a"],
  Greens: ["#5f9460"],
  Blues: ["#4d7fbf"],
  Purples: ["#8a6bb8"],
  Other: ["#3f8f8a", "#b7a089"],
};

interface Swatch {
  key: string;
  colour: WallColour;
  brandSlug?: string | null;
  label: string;
}

export interface PaintPaletteProps {
  /** The selected wall's colour, ringed in the strip. */
  current: WallColour | null;
  /** This room's suggested colours (C13's first palettes), shown after Recent. */
  suggested?: readonly SuggestedColour[];
  onPick: (colour: WallColour, brandSlug?: string | null) => void;
  /** No wall chosen yet: the swatches show but can't be tapped. */
  disabled?: boolean;
  gutter: number;
  /** Head the family row with this step's number (Paint's step 2). */
  step?: number;
}

/**
 * C11's palette, on screen under the room at all times: a row of colour-family dots,
 * then two rows of swatches that scroll sideways — recent colours first, then the
 * room's suggested ones, then the catalogue. A tap paints the selected wall; the full
 * picker (C12) is still one tap away for search.
 *
 * The families are dots, not words. "Oranges & browns" asks to be read; an orange dot
 * is the answer to "which colours?" before it is read at all, and eleven of them fit a
 * row that eleven words never did. Each still says its name to a screen reader.
 */
export function PaintPalette({ current, suggested = [], onPick, disabled, gutter, step }: PaintPaletteProps) {
  const { colors, radius } = useTheme();
  const recent = useRecentShades();
  const catalogue = useCatalogue();
  const scheme = useShadeScheme();
  const [family, setFamily] = useState<ParentFamily | null>(null);

  const shades = catalogue.data?.shades;
  const families = useMemo(() => familiesPresent(shades ?? []), [shades]);

  const columns = useMemo(() => {
    const items: Swatch[] = [];
    const seen = new Set<string>();
    if (!family) {
      for (const r of recent) {
        seen.add(r.code.toUpperCase());
        items.push({
          key: `r-${r.code}`,
          colour: { hex: r.hex, code: r.code, lrv: r.lrv },
          brandSlug: r.brandSlug,
          label: `${t("paint.recent")}: ${r.code}`,
        });
      }
      for (const c of suggested) {
        if (!c.code || seen.has(c.code.toUpperCase())) continue;
        seen.add(c.code.toUpperCase());
        items.push({ key: `s-${c.code}`, colour: { hex: c.hex, code: c.code, lrv: c.lrv }, brandSlug: c.brandSlug, label: `${t("paint.suggested")}: ${c.code}` });
      }
    }
    const shown = filterShades(shades ?? [], { ...NO_FILTER, family }, { hideCodes: !scheme.showRealCodes, hideNames: !namesShown(scheme) });
    for (const s of shown) {
      const colour = shadeColour(s, scheme);
      const code = colour.code ?? s.hex;
      if (seen.has(code.toUpperCase())) continue;
      seen.add(code.toUpperCase());
      const name = shownName(scheme, s);
      items.push({ key: `${s.brand}:${s.code}`, colour, brandSlug: s.brandSlug, label: name ? `${name}, ${code}` : code });
    }
    const out: Swatch[][] = [];
    for (let i = 0; i < items.length; i += ROWS) out.push(items.slice(i, i + ROWS));
    return out;
  }, [family, recent, suggested, shades, scheme]);

  const isCurrent = (c: WallColour) =>
    Boolean(current && current.hex.toLowerCase() === c.hex.toLowerCase() && (current.code ?? null) === (c.code ?? null));

  let strip;
  if (catalogue.loading && columns.length === 0) {
    strip = (
      <View style={[styles.row, { gap: GAP, paddingHorizontal: gutter }]}>
        {Array.from({ length: 8 }, (_, i) => (
          <View key={i} style={{ gap: GAP }}>
            <Skeleton width={SWATCH} height={SWATCH} radius={SWATCH / 2} />
            <Skeleton width={SWATCH} height={SWATCH} radius={SWATCH / 2} />
          </View>
        ))}
      </View>
    );
  } else if (columns.length === 0) {
    strip = (
      <View style={[styles.empty, { paddingHorizontal: gutter }]}>
        <Text variant="small" tone="mute">
          {t("paint.paletteEmpty")}
        </Text>
      </View>
    );
  } else {
    strip = (
      <FlatList
        horizontal
        data={columns}
        keyExtractor={(col) => col.map((s) => s.key).join("|")}
        showsHorizontalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={5}
        contentContainerStyle={{ paddingHorizontal: gutter }}
        ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
        renderItem={({ item: col }) => (
          <View style={{ gap: GAP }}>
            {col.map((s) => {
              const on = isCurrent(s.colour);
              return (
                <Pressable
                  key={s.key}
                  onPress={() => onPick(s.colour, s.brandSlug)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={s.label}
                  accessibilityState={{ selected: on, disabled: Boolean(disabled) }}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: s.colour.hex,
                      borderWidth: on ? 3 : hairline,
                      borderColor: on ? colors.fg : colors.ruleStrong,
                      opacity: disabled ? 0.5 : 1,
                    },
                  ]}
                  testID="palette-swatch"
                />
              );
            })}
          </View>
        )}
      />
    );
  }

  return (
    <View style={{ gap: 8 }} testID="paint-palette">
      {families.length > 1 || step ? (
        <View style={styles.familyRow}>
          {step ? <StepNumber n={step} style={{ marginLeft: gutter }} /> : null}
          {families.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.fill}
              contentContainerStyle={{ gap: 2, paddingLeft: step ? 6 : gutter - 4, paddingRight: gutter, alignItems: "center" }}
            >
              <FamilyDot look={FAMILY_LOOK.all} label={t("families.all")} selected={!family} onPress={() => setFamily(null)} />
              {families.map((f) => (
                <FamilyDot
                  key={f}
                  look={FAMILY_LOOK[f]}
                  label={t(`families.${f}` as MessageKey)}
                  selected={family === f}
                  onPress={() => setFamily(family === f ? null : f)}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.strip, { borderRadius: radius.sm }]}>{strip}</View>
    </View>
  );
}

/**
 * One colour family, as a dot. Round where a swatch is square, so it is never taken for
 * a colour that can go on a wall; the chosen one wears an ink ring, which shows round a
 * white dot and a black one alike.
 */
function FamilyDot({
  look,
  label,
  selected,
  onPress,
}: {
  look: readonly [string, ...string[]];
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const [first, ...rest] = look;
  const fill =
    rest.length === 0 ? (
      <View style={[styles.fill, { backgroundColor: first }]} />
    ) : rest.length === 1 ? (
      // Two colours, split corner to corner rather than blended into a third.
      <LinearGradient
        colors={[first, first, rest[0]!, rest[0]!]}
        locations={[0, 0.5, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fill}
      />
    ) : (
      <LinearGradient colors={[first, ...rest] as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
    );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[styles.ring, { borderColor: selected ? colors.fg : "transparent" }]}
      testID="family-dot"
    >
      <View style={[styles.dot, { borderColor: colors.ruleStrong }]}>{fill}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  familyRow: { flexDirection: "row", alignItems: "center", height: RING },
  ring: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: hairline, overflow: "hidden" },
  row: { flexDirection: "row" },
  strip: { height: PALETTE_STRIP_HEIGHT },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2 },
  empty: { flex: 1, justifyContent: "center" },
});
