import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { messageFor } from "@/api/errors";
import { shareApi } from "@/api/endpoints/share";
import { keys } from "@/api/query-keys";
import { Button, Chip, Sheet, Skeleton, SwatchTile, Text, TextField } from "@/components/ui";
import { filterShades, NO_FILTER } from "@/features/catalogue/filter";
import type { WallColour } from "@/features/studio/paint-store";
import { shadeColour } from "@/features/studio/shade-colour";
import { t } from "@/i18n";
import type { ShadeCodeScheme } from "@/lib/shade-codes";
import { mapToPaintShade } from "@/lib/shade-mapping";
import { useTheme } from "@/theme";

/** Tiles drawn at once; a company can hold thousands, so the rest are found by searching. */
const SHOWN = 60;
const COLUMNS = 4;

/**
 * D2's colours: only the companies this link offers, and their shades, read one company
 * at a time as it's opened — never the viewer's own catalogue. Codes only (the link never
 * shows names or prints a company against a shade).
 */
export function SharedPalette({
  token,
  visible,
  wallName,
  scheme,
  onPick,
  onClose,
}: {
  token: string;
  visible: boolean;
  wallName: string;
  scheme: ShadeCodeScheme;
  onPick: (colour: WallColour) => void;
  onClose: () => void;
}) {
  const { space } = useTheme();
  const { width } = useWindowDimensions();
  const brands = useQuery({ queryKey: keys.sharedBrands(token), queryFn: () => shareApi.brands(token), enabled: visible, staleTime: 10 * 60_000 });
  const offered = useMemo(() => (brands.data ?? []).filter((b) => b.shadeCount > 0), [brands.data]);
  const [brand, setBrand] = useState<string | null>(null);
  const active = brand ?? offered[0]?.slug ?? null;
  const shades = useQuery({
    queryKey: keys.sharedShades(token, active ?? ""),
    queryFn: () => shareApi.shades(token, active!),
    enabled: visible && Boolean(active),
    staleTime: 10 * 60_000,
    select: (rows) => rows.filter((r) => r.hexCode).map(mapToPaintShade),
  });
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);

  const found = useMemo(
    () => filterShades(shades.data ?? [], { ...NO_FILTER, query: deferred }, { hideCodes: !scheme.showRealCodes, hideNames: true }),
    [shades.data, deferred, scheme.showRealCodes],
  );
  // A new wall starts with an empty search.
  const close = () => {
    setQuery("");
    onClose();
  };
  const gap = space.xs;
  const tile = Math.floor((Math.min(width, 640) - space.gutter * 2 - gap * (COLUMNS - 1)) / COLUMNS);

  let body: React.ReactNode;
  if (brands.isPending || (active && shades.isPending)) {
    body = (
      <View style={{ gap: space.xs }} testID="palette-loading">
        <Text variant="small" tone="mute">
          {t("sharedRoom.loadingColours")}
        </Text>
        <View style={[styles.wrap, { gap }]}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} width={tile} height={tile} radius={8} />
          ))}
        </View>
      </View>
    );
  } else if (brands.isError || shades.isError) {
    const err = brands.error ?? shades.error;
    body = (
      <View style={{ gap: space.xs }}>
        <Text variant="body" tone="danger">
          {messageFor(err, t("sharedRoom.coloursFailed"))}
        </Text>
        <Button variant="secondary" label={t("common.retry")} onPress={() => void (brands.isError ? brands.refetch() : shades.refetch())} />
      </View>
    );
  } else if (!offered.length) {
    body = (
      <Text variant="body" tone="soft">
        {t("sharedRoom.noBrands")}
      </Text>
    );
  } else if (!found.length) {
    body = (
      <Text variant="body" tone="soft">
        {t("sharedRoom.noMatch", { query: deferred.trim() })}
      </Text>
    );
  } else {
    body = (
      <View style={[styles.wrap, { gap }]} testID="palette-grid">
        {found.slice(0, SHOWN).map((s) => {
          const colour = shadeColour(s, scheme);
          return (
            <SwatchTile
              key={`${s.brandSlug ?? s.brand}:${s.code}`}
              hex={s.hex}
              code={colour.code ?? s.code}
              width={tile}
              accessibilityLabel={colour.code ?? s.code}
              onPress={() => {
                setQuery("");
                onPick(colour);
              }}
            />
          );
        })}
      </View>
    );
  }

  return (
    <Sheet visible={visible} onClose={close} title={t("sharedRoom.chooseFor", { wall: wallName })} testID="palette">
      {offered.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
          {offered.map((b) => (
            <Chip key={b.slug} role="radio" label={b.name} selected={b.slug === active} onPress={() => setBrand(b.slug)} testID={`brand-${b.slug}`} />
          ))}
        </ScrollView>
      ) : offered[0] ? (
        <Text variant="label" tone="mute">
          {offered[0].name}
        </Text>
      ) : null}
      <TextField
        label={t("sharedRoom.search")}
        placeholder={t("sharedRoom.searchHint")}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        testID="palette-search"
      />
      {body}
      <Button variant="secondary" label={t("sharedRoom.done")} onPress={close} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap" },
});
