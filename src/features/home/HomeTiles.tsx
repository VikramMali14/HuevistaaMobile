import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui";
import { t, type MessageKey } from "@/i18n";
import { hairline, minTouch, useTheme } from "@/theme";
import { SHOW_SHOP_CODES } from "@/config/hidden-features";

type IconName = ComponentProps<typeof Feather>["name"];

type TileHref =
  | "/catalogue"
  | "/shade-book"
  | "/colour-finder"
  | "/nearby"
  | "/shops"
  | "/add-shop-code"
  | "/balance"
  | "/my-products"
  | "/help";

export interface HomeTile {
  key: string;
  href: TileHref;
  icon: IconName;
  label: MessageKey;
  hint: MessageKey;
}

/**
 * The places, in the order a customer is most likely to want them, each with the same
 * picture its tab wears where it has one (Colours is the droplet, Painters the pin) so
 * learning one teaches the other. Finding a painter and finding a paint shop are two tiles,
 * as they are two places.
 *
 * "Paint my room" is not here: it is the big button on the next-step card above, which
 * already knows whether there is a room to paint, a shop to ask or a room to buy. "My
 * products" is offered only with a shop behind the account — for anybody else it can only
 * answer that no shop unlocked anything — by the same rule as the website's.
 */
export function homeTiles({ hasShop }: { hasShop: boolean }): HomeTile[] {
  return [
    { key: "colours", href: "/catalogue", icon: "droplet", label: "home.tiles.colours", hint: "home.tiles.coloursHint" },
    { key: "shade-book", href: "/shade-book", icon: "book-open", label: "home.tiles.shadeBook", hint: "home.tiles.shadeBookHint" },
    { key: "finder", href: "/colour-finder", icon: "crosshair", label: "home.tiles.finder", hint: "home.tiles.finderHint" },
    { key: "painters", href: "/nearby", icon: "map-pin", label: "home.tiles.painters", hint: "home.tiles.paintersHint" },
    { key: "shops", href: "/shops", icon: "shopping-bag", label: "home.tiles.shops", hint: "home.tiles.shopsHint" },
    // Only while shop codes are offered (src/config/hidden-features.ts).
    ...(SHOW_SHOP_CODES
      ? [{ key: "code", href: "/add-shop-code", icon: "tag", label: "home.tiles.code", hint: "home.tiles.codeHint" } as HomeTile]
      : []),
    { key: "balance", href: "/balance", icon: "credit-card", label: "home.tiles.balance", hint: "home.tiles.balanceHint" },
    ...(hasShop
      ? [{ key: "products", href: "/my-products", icon: "package", label: "home.tiles.products", hint: "home.tiles.productsHint" } as HomeTile]
      : []),
    { key: "help", href: "/help", icon: "help-circle", label: "home.tiles.help", hint: "home.tiles.helpHint" },
  ];
}

/**
 * "What would you like to do?" — a picture tile for every place a customer can go, two
 * across, like the apps on a phone's home screen. The website's home page has the same
 * tiles (HueVistaFrontEnd components/app/customer-home.tsx).
 *
 * A customer may read slowly, or read little English, and some of these places live
 * behind a switch (the Shade Book and the Colour finder are inside the Colours tab) or
 * nowhere on the tab bar at all (a shop code, the balance, help). Laid out here, each is a
 * picture, a word or three, and one short line saying what it is for.
 */
export function HomeTiles({ hasShop }: { hasShop: boolean }) {
  const router = useRouter();
  const { colors, radius, space } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="title3" accessibilityRole="header">
        {t("home.tiles.title")}
      </Text>
      <View style={styles.grid}>
        {homeTiles({ hasShop }).map((tile) => (
          <Pressable
            key={tile.key}
            testID={`home-tile-${tile.key}`}
            onPress={() => router.push(tile.href)}
            accessibilityRole="button"
            accessibilityLabel={`${t(tile.label)}. ${t(tile.hint)}`}
            style={({ pressed }) => [
              styles.tile,
              {
                borderRadius: radius.md,
                borderColor: colors.rule,
                backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
                padding: space.sm,
                gap: space.xs,
              },
            ]}
          >
            <View style={[styles.pic, { borderRadius: radius.sm, backgroundColor: colors.surfaceSoft }]}>
              <Feather name={tile.icon} size={24} color={colors.accentText} />
            </View>
            <Text variant="bodyStrong">{t(tile.label)}</Text>
            <Text variant="small" tone="mute">
              {t(tile.hint)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Two across with the space between them; a last tile on its own keeps its width.
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  tile: { width: "48.5%", minHeight: minTouch * 2, borderWidth: hairline },
  pic: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
});
