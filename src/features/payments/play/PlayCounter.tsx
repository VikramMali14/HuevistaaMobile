import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { meApi } from "@/api/endpoints/me";
import { messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { PlayProduct } from "@/api/types";
import { BackButton, Banner, Button, ChoiceCard, EmptyState, ErrorState, Screen, Skeleton, Text, useToast } from "@/components/ui";
import { useBalance } from "@/features/account/use-balance";
import { t } from "@/i18n";
import { validitySpan } from "@/lib/dates";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

import { roomsAndCredits } from "../basket-words";
import { buyPack, fetchPlayPrices, ownedMessage, playCatalogueQuery } from "./play-checkout";
import { usePlayBusy } from "./play-payments";

/** A pack this account can buy: what the server sells, at the price Google shows. */
interface Pack extends PlayProduct {
  price: string;
}

function count(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Which pack C28's link asked for: AI images alone, both, or (by default) a room. */
function highlighted(packs: Pack[], rooms: number, credits: number): Pack | undefined {
  const fits = (p: Pack) => (credits > 0 && rooms === 0 ? p.projects === 0 : rooms > 0 && credits > 0 ? p.projects > 0 && p.credits > 0 : p.projects > 0 && p.credits === 0);
  const singles = packs.filter((p) => p.projects + p.credits === 1);
  return singles.find(fits) ?? packs.find(fits) ?? packs[0];
}

function blurb(pack: PlayProduct): string {
  if (pack.projects > 0 && pack.credits > 0) return t("checkout.playBothBlurb");
  return pack.projects > 0 ? t("checkout.roomsBlurb") : t("checkout.imagesBlurb");
}

/**
 * C28 in the Android store build. Spec: docs/04-screens-customer.md — C28, "Google Play".
 *
 * The packs the server sells through Google Play that Google also knows, at Google's own
 * price; the buyer picks one, and the quantity (where the pack allows more than one) in
 * Google's sheet. `rooms`/`credits` in the link only choose which pack is highlighted.
 * The same gating as the website's counter: nothing is sold until the entitlement says
 * whether a shop adds this account's rooms, and a shop's customer is never sold a room.
 * Nothing here opens the website or mentions paying elsewhere. Buy stays off while any
 * purchase is being confirmed, so nothing is bought twice; the result is C29.
 */
export function PlayCounter({ rooms, credits, from }: { rooms?: string; credits?: string; from?: string }) {
  const router = useRouter();
  const toast = useToast();
  const { space } = useTheme();
  const balance = useBalance();
  const catalogue = useQuery(playCatalogueQuery);
  const ids = useMemo(() => (catalogue.data?.products ?? []).map((p) => p.productId), [catalogue.data]);
  const prices = useQuery({
    queryKey: keys.playPrices(ids.join(",")),
    queryFn: () => fetchPlayPrices(ids),
    enabled: Boolean(catalogue.data?.eligible) && ids.length > 0,
    staleTime: 5 * 60_000,
  });
  // Whether a shop adds this account's rooms (they are never sold one): unknown until the
  // entitlement answers, and nothing is sold on a guess.
  const shopCustomer = Boolean(balance.entitlement);
  const entitlementKnown = balance.nextStep !== null;
  const confirming = usePlayBusy();
  const buying = useSubmit();
  const [chosen, setChosen] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "danger" | "info"; message: string } | null>(null);

  const packs = useMemo<Pack[]>(() => {
    const priced = new Map((prices.data ?? []).map((p) => [p.productId, p.displayPrice]));
    return (catalogue.data?.products ?? [])
      .filter((p) => priced.has(p.productId) && p.projects + p.credits > 0)
      .filter((p) => !shopCustomer || p.projects === 0)
      .map((p) => ({ ...p, price: priced.get(p.productId)! }));
  }, [catalogue.data, prices.data, shopCustomer]);
  const pack = packs.find((p) => p.productId === chosen) ?? highlighted(packs, count(rooms), count(credits));
  const finished = useQuery({ queryKey: keys.boards, queryFn: meApi.renderableProjects, enabled: (pack?.credits ?? 0) > 0 });

  // Held while Google's sheet is up, so its result has somewhere to be shown.
  usePreventRemove(buying.busy, () => {});

  const buy = () => {
    if (!pack || !entitlementKnown || confirming) return;
    void buying.run(async () => {
      setNotice(null);
      try {
        const result = await buyPack(pack.productId);
        switch (result.kind) {
          case "bought":
            router.replace({ pathname: "/payment-result", params: { play: result.token, ...(from === "ai-image" ? { from } : {}) } });
            return;
          case "cancelled":
            toast.show(t("checkout.cancelled"), "info");
            return;
          case "owned":
            if (result.notice === "added") toast.show(ownedMessage(result.notice), "success");
            else setNotice({ tone: "info", message: ownedMessage(result.notice) });
            return;
          case "no-answer":
            setNotice({ tone: "info", message: t("checkout.playNoAnswer") });
            return;
          default:
            setNotice({ tone: "danger", message: result.message });
        }
      } catch (err) {
        setNotice({ tone: "danger", message: messageFor(err, t("checkout.playFailed")) });
      }
    });
  };

  const data = catalogue.data;
  let body;
  if (catalogue.isPending || balance.loading || (prices.isPending && prices.fetchStatus !== "idle")) {
    body = (
      <View style={{ gap: space.md }} testID="checkout-loading">
        <Skeleton height={96} radius={16} />
        <Skeleton height={96} radius={16} />
      </View>
    );
  } else if (!data && catalogue.isError) {
    body = <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />;
  } else if (!entitlementKnown) {
    body = <ErrorState message={t("checkout.entitlementFailed")} onRetry={() => void balance.refetch()} />;
  } else if (data?.eligible && prices.isError) {
    body = <ErrorState message={t("checkout.playUnreachable")} onRetry={() => void prices.refetch()} />;
  } else if (!data?.eligible || !pack) {
    body = <EmptyState icon="slash" title={t("checkout.notForYou")} />;
  } else {
    body = (
      <>
        <Text variant="lead">{t("checkout.playLead", { span: validitySpan(data.validDays) })}</Text>
        {shopCustomer ? (
          <Text variant="small" tone="mute">
            {t("checkout.shopRooms")}
          </Text>
        ) : null}
        <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
          {packs.map((p) => (
            <ChoiceCard
              key={p.productId}
              title={t("checkout.playPack", { what: roomsAndCredits(p.projects, p.credits), price: p.price })}
              body={blurb(p)}
              selected={p.productId === pack.productId}
              onPress={() => setChosen(p.productId)}
              testID={`checkout-pack-${p.productId}`}
            />
          ))}
        </View>
        {pack.projects + pack.credits === 1 ? (
          <Text variant="small" tone="mute">
            {t("checkout.playQuantity")}
          </Text>
        ) : null}
        {pack.credits > 0 && finished.data?.length === 0 ? (
          <Banner tone="info" message={t("checkout.noFinishedRoom", { span: validitySpan(data.validDays) })} />
        ) : null}
      </>
    );
  }

  const ready = Boolean(data?.eligible && pack && entitlementKnown);
  return (
    <Screen
      scroll
      contentStyle={{ gap: space.lg, paddingBottom: space.xl }}
      footer={
        ready && pack ? (
          <View style={{ gap: space.xxs }}>
            <Button
              label={t("checkout.playBuy", { price: pack.price })}
              onPress={buy}
              loading={buying.busy}
              disabled={confirming}
              testID="checkout-pay"
            />
            <Text variant="caption" tone="mute" align="center">
              {t("checkout.playMethods")}
            </Text>
          </View>
        ) : undefined
      }
    >
      <BackButton fallback="/balance" />
      <Text variant="title1" accessibilityRole="header">
        {t("checkout.title")}
      </Text>
      {confirming && !buying.busy ? <Banner tone="info" message={t("checkout.playConfirming")} testID="checkout-play-confirming" /> : null}
      {notice ? <Banner tone={notice.tone} message={notice.message} testID="checkout-error" /> : null}
      {body}
    </Screen>
  );
}
