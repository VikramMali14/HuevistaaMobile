import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Card, Text } from "@/components/ui";
import { paymentsMode } from "@/config/env";
import type { Balance } from "@/features/account/balance";
import { welcomeFrames } from "@/features/auth/welcome-frames";
import { buyOnWebsite, useWhereToBuy } from "@/features/payments/where-to-buy";
import { t } from "@/i18n";
import { validitySpan } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import { hairline, useTheme } from "@/theme";
import { SHOW_SHOP_CODES } from "@/config/hidden-features";

/**
 * The one thing to do next, worked out from what the account holds (docs/04 "The three
 * next-step states", from the website's customer-next-step.tsx): start a room, ask the
 * shop for another, or buy one. Every second choice is a quiet link beside it. A painter's
 * or a shop's own home buys its room on the website, or — in the store build, where nothing
 * may say where else to pay — is offered its shop code instead (useWhereToBuy).
 *
 * `hero`: a first visit with nothing yet — the card takes the screen, a room above it.
 * The words and buttons stay on the card's own surface, so every button reads in both
 * themes (over the photo, a secondary button's ink would vanish into a dark wall).
 */
export function NextStepCard({
  balance,
  libraryLive,
  hero = false,
}: {
  balance: Balance;
  libraryLive: boolean;
  hero?: boolean;
}) {
  const router = useRouter();
  const { colors, space } = useTheme();
  const where = useWhereToBuy();
  const { nextStep, rooms, entitlement: ent, options } = balance;
  if (!nextStep) return null;

  const go = (to: "/room/new" | "/balance" | "/checkout" | "/add-shop-code") => () => router.push(to);
  let headline: string;
  let detail: string;
  // The state as a picture, read before any word is: a photo to take, the shop to ask, a
  // room to buy. Not on the hero card, whose room photo is the picture already.
  let icon: ComponentProps<typeof Feather>["name"] = "credit-card";
  // Null only where there is nothing this app may offer: a painter's or a shop's own home
  // in the store build while shop codes are switched off (src/config/hidden-features.ts).
  let main: { label: string; onPress: () => void } | null;
  const extras: { label: string; to: "/add-shop-code" | "/library"; variant: "secondary" | "ghost" }[] = [];

  if (nextStep === "ready") {
    headline = rooms === 1 ? t("home.oneRoomReady") : t("home.roomsReady", { n: rooms });
    const bought = Math.max(0, options?.availableCredits ?? 0);
    detail = ent
      ? (ent.projectAllowance === 1
          ? t("home.shopUsedOne", { created: ent.projectsCreated })
          : t("home.shopUsed", { created: ent.projectsCreated, allowance: ent.projectAllowance })) +
        (bought > 0 ? t("home.boughtToo", { n: bought }) : "")
      : t("home.boughtOnly");
    main = { label: t("home.start"), onPress: go("/room/new") };
    icon = "camera";
  } else if (nextStep === "exhausted") {
    headline =
      ent && ent.projectAllowance > 1
        ? t("home.allUsed", { n: ent.projectAllowance })
        : ent && ent.projectAllowance === 1
          ? t("home.allUsedOne")
          : t("home.noneOnCode");
    detail = t("home.exhaustedBody");
    // Shop customers are never sold a room: their shop adds one free from the counter.
    main = { label: t("home.ask"), onPress: go("/balance") };
    icon = "shopping-bag";
    if (SHOW_SHOP_CODES) extras.push({ label: t("home.freshCode"), to: "/add-shop-code", variant: "ghost" });
  } else if (where === "none") {
    // A painter's or a shop's own home in the store build: no room is sold here, and
    // nothing may say where else to buy one.
    headline = t("home.missingTitle");
    detail = SHOW_SHOP_CODES ? t("home.missingBodyNone") : t("home.missingBodyNoneNoCode");
    main = SHOW_SHOP_CODES ? { label: t("home.haveCode"), onPress: go("/add-shop-code") } : null;
  } else if (where === "website") {
    headline = t("home.missingTitle");
    detail = t("checkout.onWebsite");
    main = { label: t("home.buyWebsite"), onPress: () => void buyOnWebsite() };
    if (SHOW_SHOP_CODES) extras.push({ label: t("home.haveCode"), to: "/add-shop-code", variant: "secondary" });
  } else {
    headline = t("home.missingTitle");
    // Google Play charges its own price for a room, so the website's is never quoted there.
    const priced = paymentsMode() === "play" ? null : options;
    detail = priced
      ? t(SHOW_SHOP_CODES ? "home.missingBody" : "home.missingBodyNoCode", {
          price: formatRupees(priced.projectPricePaise),
          span: validitySpan(priced.validDays),
        })
      : t(SHOW_SHOP_CODES ? "home.missingBodyPlain" : "home.missingBodyPlainNoCode");
    main = {
      label: priced ? t("home.buy", { price: formatRupees(priced.projectPricePaise) }) : t("home.buyPlain"),
      onPress: go("/checkout"),
    };
    if (SHOW_SHOP_CODES) extras.push({ label: t("home.haveCode"), to: "/add-shop-code", variant: "secondary" });
  }
  if (libraryLive && nextStep !== "ready") extras.push({ label: t("home.tryReady"), to: "/library", variant: "ghost" });

  const content = (
    <View style={{ gap: space.md }}>
      {!hero ? (
        <View style={[styles.pic, { borderColor: colors.ruleBrass, backgroundColor: colors.surfaceSoft }]} testID="next-step-picture">
          <Feather name={icon} size={26} color={colors.accentText} />
        </View>
      ) : null}
      <View style={{ gap: space.xs }}>
        <Text variant={hero ? "display" : "title2"} accessibilityRole="header">
          {headline}
        </Text>
        <Text variant="body" tone="soft">
          {detail}
        </Text>
      </View>
      <View style={{ gap: space.xs }}>
        {main ? <Button label={main.label} onPress={main.onPress} testID="next-step" /> : null}
        {extras.map((x) => (
          <Button key={x.to} label={x.label} variant={x.variant} onPress={() => router.push(x.to)} />
        ))}
      </View>
    </View>
  );

  if (!hero) return <Card lit={nextStep !== "ready"}>{content}</Card>;

  return (
    <Card lit style={{ padding: 0, overflow: "hidden" }}>
      <View style={styles.photo}>
        <Image source={welcomeFrames[2]?.source} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
        {/* The photo settles into the card instead of ending on a hard edge. */}
        <LinearGradient
          colors={[`${colors.surface}00`, colors.surface]}
          locations={[0.6, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>
      <View style={{ padding: space.lg, paddingTop: space.xs }}>{content}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  photo: { height: 240 },
  pic: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: hairline,
    alignItems: "center",
    justifyContent: "center",
  },
});
