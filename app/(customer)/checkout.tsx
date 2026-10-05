import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { billingApi } from "@/api/endpoints/billing";
import { meApi } from "@/api/endpoints/me";
import { messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { CartCatalogue } from "@/api/types";
import { useSession } from "@/auth/session";
import { BackButton, Banner, Button, EmptyState, ErrorState, Screen, Skeleton, Stepper, Text, useToast } from "@/components/ui";
import { useBalance } from "@/features/account/use-balance";
import { payForBasket, verifyPayment } from "@/features/payments/payments";
import { usePaidButUnconfirmed } from "@/features/payments/pending-payment";
import { t } from "@/i18n";
import { packCart, packSingly, type PackedCart } from "@/lib/cart-pack";
import { validitySpan } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";
import { hairline, useTheme } from "@/theme";

function count(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

const rooms = (n: number) => (n === 1 ? t("checkout.oneRoom") : t("checkout.rooms", { n }));
const images = (n: number) => (n === 1 ? t("checkout.oneImage") : t("checkout.images", { n }));
function both(r: number, p: number): string {
  if (r > 0 && p > 0) return t("checkout.and", { a: rooms(r), b: images(p) });
  return r > 0 ? rooms(r) : images(p);
}

/** Which package took the money off — named, so a bundle price never looks like a mistake. */
function packingLine(packed: PackedCart, cart: CartCatalogue): string {
  if (packed.bundles > 0) {
    return `${t("checkout.bundled")} (${t("checkout.offer", {
      rooms: cart.bundleProjects ?? 0,
      images: cart.bundleCredits ?? 0,
      price: formatRupees(cart.bundlePricePaise ?? 0),
    })})`;
  }
  return t("checkout.bundled");
}

/**
 * C28 · Checkout. Spec: docs/04-screens-customer.md — C28.
 *
 * The website's counter (credits-cart.tsx): say how many rooms and AI images, and the
 * basket is packed the cheapest way the server sells them (lib/cart-pack — singles,
 * combos, the bundle, and the offer a subtotal earns, all priced as the server prices
 * them). Pay opens Razorpay on the website's /pay/mobile page; only the server's
 * verification decides what was bought (C29). As built: no discount-code field — the
 * best offer a basket reaches applies itself, and a code can only name one it already
 * reaches. A shop's customer is never sold a room here: their shop adds rooms.
 */
export default function Checkout() {
  const router = useRouter();
  const toast = useToast();
  const { colors, radius, space } = useTheme();
  const { profile } = useSession();
  const params = useLocalSearchParams<{ rooms?: string; credits?: string }>();
  const balance = useBalance();
  const cart = useQuery({ queryKey: keys.cart, queryFn: billingApi.cart });
  const shopCustomer = Boolean(balance.entitlement);
  const [want, setWant] = useState(() => {
    const credits = count(params.credits, 0);
    return { rooms: count(params.rooms, credits > 0 ? 0 : 1), pictures: credits };
  });
  const [error, setError] = useState<string | null>(null);
  const paying = useSubmit();
  const checking = useSubmit();
  const stuck = usePaidButUnconfirmed(profile?.id);
  const finished = useQuery({ queryKey: keys.boards, queryFn: meApi.renderableProjects, enabled: want.pictures > 0 });

  // Focus, so a result that also arrived through the D3 deep link is shown once: by
  // whichever screen is on top.
  const focused = useRef(true);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );

  const data = cart.data;
  const wantRooms = shopCustomer ? 0 : want.rooms;
  const packed = useMemo(() => (data ? packCart(wantRooms, want.pictures, data) : null), [data, wantRooms, want.pictures]);
  const listPaise = useMemo(() => (data ? packSingly(wantRooms, want.pictures, data).subtotalPaise : 0), [data, wantRooms, want.pictures]);

  const pay = () => {
    if (!packed || packed.totalPaise <= 0 || !profile || stuck) return;
    void paying.run(async () => {
      setError(null);
      try {
        const state = await payForBasket({
          split: { projects: packed.projects, credits: packed.credits, combos: packed.combos, bundles: packed.bundles },
          accountId: profile.id,
          prefill: { name: profile.namePending ? null : profile.name, email: profile.email, contact: profile.phoneNumber },
        });
        if (state.kind === "cancelled") {
          toast.show(t("checkout.cancelled"), "info");
          return;
        }
        if (focused.current) router.replace({ pathname: "/payment-result", params: { order: state.orderId } });
      } catch (err) {
        setError(messageFor(err));
      }
    });
  };

  const checkNow = () => {
    const proof = stuck?.paid;
    if (!stuck || !proof) return;
    void checking.run(async () => {
      const state = await verifyPayment(stuck.orderId, proof.paymentId, proof.signature);
      if (state.kind === "verified") router.replace({ pathname: "/payment-result", params: { order: state.orderId } });
    });
  };

  let body;
  if (cart.isPending) {
    body = (
      <View style={{ gap: space.md }} testID="checkout-loading">
        <Skeleton height={96} radius={16} />
        <Skeleton height={96} radius={16} />
      </View>
    );
  } else if (cart.isError) {
    body = <ErrorState error={cart.error} onRetry={() => void cart.refetch()} />;
  } else if (!data?.eligible || !packed) {
    body = <EmptyState icon="slash" title={t("checkout.notForYou")} />;
  } else {
    const max = data.maxQuantity || 20;
    const empty = wantRooms + want.pictures === 0;
    const packSaving = Math.max(0, listPaise - packed.subtotalPaise);
    const ticket = packSaving > 0 ? listPaise : packed.subtotalPaise;
    const extra = packed.roomsGranted - wantRooms + (packed.picturesGranted - want.pictures);
    const bundle =
      !shopCustomer && data.bundleAvailable && (data.bundlePricePaise ?? 0) > 0 && (data.bundleListPricePaise ?? 0) > (data.bundlePricePaise ?? 0) && packed.bundles === 0
        ? {
            rooms: data.bundleProjects ?? 0,
            pictures: data.bundleCredits ?? 0,
            price: data.bundlePricePaise ?? 0,
            saving: (data.bundleListPricePaise ?? 0) - (data.bundlePricePaise ?? 0),
          }
        : null;
    const line = (title: string, blurb: string, price: number, value: number, onChange: (n: number) => void, noun: (n: number) => string, testID: string) => (
      <View style={[styles.line, { borderTopColor: colors.rule }]}>
        <View style={[styles.fill, { gap: 2 }]}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="small" tone="soft">
            {blurb}
          </Text>
          <Text variant="small" tone="mute">
            {t("checkout.each", { price: formatRupees(price) })}
          </Text>
        </View>
        <Stepper
          value={value}
          max={max}
          onChange={onChange}
          describe={noun}
          fewerLabel={`${t("checkout.fewer")}: ${title}`}
          moreLabel={`${t("checkout.more")}: ${title}`}
          disabled={paying.busy || Boolean(stuck)}
          testID={testID}
        />
      </View>
    );

    body = (
      <>
        <Text variant="lead">{t("checkout.lead", { span: validitySpan(data.validDays) })}</Text>
        {shopCustomer ? (
          <Text variant="small" tone="mute">
            {t("checkout.shopRooms")}
          </Text>
        ) : (
          line(t("checkout.roomsLine"), t("checkout.roomsBlurb"), data.projectPricePaise, want.rooms, (n) => setWant((w) => ({ ...w, rooms: n })), rooms, "stepper-rooms")
        )}
        <View style={{ gap: space.xs }}>
          {!shopCustomer ? (
            <Text variant="label" tone="mute">
              {t("checkout.addOn")}
            </Text>
          ) : null}
          {line(t("checkout.imagesLine"), t("checkout.imagesBlurb"), data.creditPricePaise, want.pictures, (n) => setWant((w) => ({ ...w, pictures: n })), images, "stepper-images")}
        </View>
        {want.pictures > 0 && finished.data?.length === 0 ? (
          <Banner tone="info" message={t("checkout.noFinishedRoom", { span: validitySpan(data.validDays) })} />
        ) : null}

        {bundle ? (
          <Pressable
            onPress={() => setWant((w) => ({ rooms: Math.max(w.rooms, bundle.rooms), pictures: Math.max(w.pictures, bundle.pictures) }))}
            disabled={paying.busy || Boolean(stuck)}
            accessibilityRole="button"
            style={[styles.offer, { borderColor: colors.accent, borderRadius: radius.md, padding: space.md, gap: 4 }]}
            testID="checkout-offer"
          >
            <Text variant="label" tone="accent">
              {t("checkout.offerFlag")}
            </Text>
            <Text variant="bodyStrong">
              {t("checkout.offer", { rooms: bundle.rooms, images: bundle.pictures, price: formatRupees(bundle.price) })}
            </Text>
            <Text variant="small" tone="soft">
              {t("checkout.offerSave", { saving: formatRupees(bundle.saving) })}
            </Text>
          </Pressable>
        ) : null}

        {!empty ? (
          <View style={[styles.bill, { borderColor: colors.rule, borderRadius: radius.md, padding: space.md, gap: space.xs }]} accessibilityLiveRegion="polite" testID="checkout-bill">
            <View style={styles.billRow}>
              <Text variant="body">{t("checkout.itemTotal")}</Text>
              <Text variant="body">{formatRupees(ticket)}</Text>
            </View>
            {packSaving > 0 ? (
              <View style={styles.billRow}>
                <Text variant="small" tone="soft" style={styles.fill}>
                  {packingLine(packed, data)}
                </Text>
                <Text variant="small" tone="soft">{`−${formatRupees(packSaving)}`}</Text>
              </View>
            ) : null}
            {packed.offer && packed.discountPaise > 0 ? (
              <View style={styles.billRow}>
                <Text variant="small" tone="soft">
                  {t("checkout.percentOff", { n: packed.offer.percentOff })}
                </Text>
                <Text variant="small" tone="soft">{`−${formatRupees(packed.discountPaise)}`}</Text>
              </View>
            ) : null}
            <View style={[styles.billRow, styles.total, { borderTopColor: colors.rule }]}>
              <Text variant="bodyStrong">{t("checkout.toPay")}</Text>
              <Text variant="bodyStrong" testID="checkout-total">
                {formatRupees(packed.totalPaise)}
              </Text>
            </View>
            <Text variant="small" tone="mute">
              {extra > 0
                ? t("checkout.surplus", {
                    basket: both(packed.roomsGranted, packed.picturesGranted),
                    extra: both(packed.roomsGranted - wantRooms, packed.picturesGranted - want.pictures),
                  })
                : both(packed.roomsGranted, packed.picturesGranted)}
            </Text>
          </View>
        ) : null}
      </>
    );
  }

  const ready = Boolean(data?.eligible && packed && packed.totalPaise > 0);
  return (
    <Screen
      scroll
      contentStyle={{ gap: space.lg, paddingBottom: space.xl }}
      footer={
        data?.eligible && packed ? (
          <View style={{ gap: space.xxs }}>
            <Button
              label={ready ? t("checkout.pay", { amount: formatRupees(packed.totalPaise) }) : t("checkout.empty")}
              onPress={pay}
              loading={paying.busy}
              disabled={!ready || Boolean(stuck)}
              testID="checkout-pay"
            />
            <Text variant="caption" tone="mute" align="center">
              {t("checkout.methods")}
            </Text>
          </View>
        ) : undefined
      }
    >
      <BackButton fallback="/balance" />
      <Text variant="title1" accessibilityRole="header">
        {t("checkout.title")}
      </Text>
      {stuck ? (
        <Banner tone="warning" message={t("checkout.stuck")} testID="checkout-stuck">
          <Button variant="ghost" block={false} label={t("checkout.checkNow")} onPress={checkNow} loading={checking.busy} />
        </Banner>
      ) : null}
      {error ? <Banner tone="danger" message={error} testID="checkout-error" /> : null}
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  line: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: hairline, paddingTop: 14 },
  offer: { borderWidth: 1 },
  bill: { borderWidth: hairline },
  billRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  total: { borderTopWidth: hairline, paddingTop: 8, marginTop: 4 },
});
