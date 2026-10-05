import Feather from "@expo/vector-icons/Feather";
import { useQuery } from "@tanstack/react-query";
import { Linking, StyleSheet, View } from "react-native";

import { meApi } from "@/api/endpoints/me";
import { keys } from "@/api/query-keys";
import type { ShopProduct } from "@/api/types";
import { BackButton, Button, Card, EmptyState, ErrorState, Screen, Skeleton, Text } from "@/components/ui";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

/** "₹1,250 · per litre" — the shop's own price, in rupees as they typed it. */
function priceOf(p: ShopProduct): string | null {
  if (p.price == null) return null;
  const rupees = `₹${Number.isInteger(p.price) ? p.price.toLocaleString("en-IN") : p.price.toFixed(2)}`;
  return p.priceUnit ? t("products.price", { price: rupees, unit: p.priceUnit }) : rupees;
}

/**
 * C31 · My products. Spec: docs/04-screens-customer.md — C31.
 *
 * What each shop behind this account unlocked — its companies and product lines — with
 * the shop's address, hours and a call button.
 */
export default function MyProducts() {
  const { colors, space } = useTheme();
  const query = useQuery({ queryKey: keys.assignedProducts, queryFn: meApi.assignedProducts });
  const shops = (query.data?.shops ?? []).filter((s) => s.products.length > 0 || s.allowedBrands?.length);

  let body;
  if (query.isPending) {
    body = (
      <View style={{ gap: space.md }} testID="products-loading">
        <Skeleton height={120} radius={16} />
        <Skeleton height={120} radius={16} />
      </View>
    );
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else if (shops.length === 0) {
    body = <EmptyState icon="package" title={t("products.empty")} body={t("products.emptyBody")} />;
  } else {
    body = shops.map((shop) => {
      const byBrand = new Map<string, ShopProduct[]>();
      for (const p of shop.products) {
        const brand = p.brandName?.trim() || "—";
        byBrand.set(brand, [...(byBrand.get(brand) ?? []), p]);
      }
      return (
        <Card key={shop.shopId}>
          <View style={{ gap: space.md }}>
            <View style={{ gap: space.xxs }}>
              <Text variant="title3" accessibilityRole="header">
                {shop.shopName}
              </Text>
              {[shop.address, shop.city].filter(Boolean).length ? (
                <Text variant="small" tone="mute">
                  {[shop.address, shop.city].filter(Boolean).join(", ")}
                </Text>
              ) : null}
              {shop.openingHours ? (
                <Text variant="small" tone="mute">
                  {t("products.hours", { hours: shop.openingHours })}
                </Text>
              ) : null}
            </View>
            {[...byBrand].map(([brand, products]) => (
              <View key={brand} style={{ gap: space.xs }}>
                <Text variant="label" tone="mute">
                  {brand}
                </Text>
                {products.map((p) => (
                  <View key={p.id} style={[styles.product, { borderTopColor: colors.rule }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyStrong">{p.lineName || "—"}</Text>
                      <Text variant="small" tone="mute">
                        {[p.finish, p.packSize, p.coverage].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    {priceOf(p) ? <Text variant="small">{priceOf(p)}</Text> : null}
                  </View>
                ))}
              </View>
            ))}
            {shop.phone ? (
              <Button
                variant="secondary"
                icon="phone"
                label={t("products.call", { shop: shop.shopName })}
                onPress={() => void Linking.openURL(`tel:${shop.phone}`)}
              />
            ) : null}
          </View>
        </Card>
      );
    });
  }

  return (
    <Screen scroll onRefresh={() => void query.refetch()} refreshing={query.isRefetching} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <BackButton fallback="/account" />
      <View style={{ gap: space.xs }}>
        <View style={styles.title}>
          <Feather name="package" size={22} color={colors.accentText} />
          <Text variant="title1" accessibilityRole="header">
            {t("products.title")}
          </Text>
        </View>
        <Text variant="lead">{t("products.lead")}</Text>
      </View>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: "row", alignItems: "center", gap: 10 },
  product: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, paddingTop: 10 },
});
