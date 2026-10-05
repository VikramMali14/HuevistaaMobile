import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button, Card, Text } from "@/components/ui";
import type { Balance } from "@/features/account/balance";
import { welcomeFrames } from "@/features/auth/welcome-frames";
import { t } from "@/i18n";
import { validitySpan } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import { useTheme } from "@/theme";

/**
 * The one thing to do next, worked out from what the account holds (docs/04 "The three
 * next-step states", from the website's customer-next-step.tsx): start a room, ask the
 * shop for another, or buy one. Every second choice is a quiet link beside it.
 *
 * `hero`: a first visit with nothing yet — the card takes the screen, a room behind it.
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
  const { nextStep, rooms, entitlement: ent, options } = balance;
  if (!nextStep) return null;

  let headline: string;
  let detail: string;
  let main: { label: string; to: "/room/new" | "/balance" | "/checkout" };
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
    main = { label: t("home.start"), to: "/room/new" };
  } else if (nextStep === "exhausted") {
    headline =
      ent && ent.projectAllowance > 1
        ? t("home.allUsed", { n: ent.projectAllowance })
        : ent && ent.projectAllowance === 1
          ? t("home.allUsedOne")
          : t("home.noneOnCode");
    detail = t("home.exhaustedBody");
    // Shop customers are never sold a room: their shop adds one free from the counter.
    main = { label: t("home.ask"), to: "/balance" };
    extras.push({ label: t("home.freshCode"), to: "/add-shop-code", variant: "ghost" });
  } else {
    headline = t("home.missingTitle");
    detail = options
      ? t("home.missingBody", { price: formatRupees(options.projectPricePaise), span: validitySpan(options.validDays) })
      : t("home.missingBodyPlain");
    main = {
      label: options ? t("home.buy", { price: formatRupees(options.projectPricePaise) }) : t("home.buyPlain"),
      to: "/checkout",
    };
    extras.push({ label: t("home.haveCode"), to: "/add-shop-code", variant: "secondary" });
  }
  if (libraryLive && nextStep !== "ready") extras.push({ label: t("home.tryReady"), to: "/library", variant: "ghost" });

  const content = (
    <View style={{ gap: space.md }}>
      <View style={{ gap: space.xs }}>
        <Text variant={hero ? "display" : "title2"} accessibilityRole="header" style={hero ? { color: colors.ivory } : null}>
          {headline}
        </Text>
        <Text variant="body" tone="soft" style={hero ? { color: colors.ivory, opacity: 0.86 } : null}>
          {detail}
        </Text>
      </View>
      <View style={{ gap: space.xs }}>
        <Button label={main.label} onPress={() => router.push(main.to)} testID="next-step" />
        {extras.map((x) => (
          <Button key={x.to} label={x.label} variant={x.variant} onPress={() => router.push(x.to)} />
        ))}
      </View>
    </View>
  );

  if (!hero) return <Card lit={nextStep !== "ready"}>{content}</Card>;

  return (
    <View style={[styles.hero, { borderRadius: 22, backgroundColor: colors.bgDeep }]}>
      <Image source={welcomeFrames[2]?.source} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
      <LinearGradient
        colors={["rgba(10,9,8,0.05)", "rgba(10,9,8,0.55)", "rgba(10,9,8,0.92)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ padding: space.lg }}>{content}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 460, overflow: "hidden", justifyContent: "flex-end" },
});
