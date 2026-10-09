import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Chip, Skeleton, Text } from "@/components/ui";
import { familiesPresent, filterShades, NO_FILTER } from "@/features/catalogue/filter";
import { namesShown, shownName, useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { useRecentShades, type WallColour } from "@/features/studio/paint-store";
import { shadeColour } from "@/features/studio/shade-colour";
import { t, type MessageKey } from "@/i18n";
import type { ParentFamily } from "@/lib/colour-families";
import { hairline, useTheme } from "@/theme";

const SWATCH = 40;
const GAP = 8;
const ROWS = 2;
/** The swatch strip's height, whatever is in it: the canvas above must keep its size. */
export const PALETTE_STRIP_HEIGHT = SWATCH * ROWS + GAP * (ROWS - 1);

interface Swatch {
  key: string;
  colour: WallColour;
  brandSlug?: string | null;
  label: string;
}

export interface PaintPaletteProps {
  /** The selected wall's colour, ringed in the strip. */
  current: WallColour | null;
  onPick: (colour: WallColour, brandSlug?: string | null) => void;
  /** No wall chosen yet: the swatches show but can't be tapped. */
  disabled?: boolean;
  gutter: number;
}

/**
 * C11's palette, on screen under the room at all times: family chips, then two rows of
 * swatches that scroll sideways — recent colours first, then the catalogue. A tap paints
 * the selected wall; the full picker (C12) is still one tap away for search.
 */
export function PaintPalette({ current, onPick, disabled, gutter }: PaintPaletteProps) {
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
  }, [family, recent, shades, scheme]);

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
    <View style={{ gap: 10 }} testID="paint-palette">
      {families.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: GAP, paddingHorizontal: gutter }}>
          <Chip label={t("families.all")} selected={!family} onPress={() => setFamily(null)} />
          {families.map((f) => (
            <Chip key={f} label={t(`families.${f}` as MessageKey)} selected={family === f} onPress={() => setFamily(family === f ? null : f)} />
          ))}
        </ScrollView>
      ) : null}
      <View style={[styles.strip, { borderRadius: radius.sm }]}>{strip}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  strip: { height: PALETTE_STRIP_HEIGHT },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2 },
  empty: { flex: 1, justifyContent: "center" },
});
