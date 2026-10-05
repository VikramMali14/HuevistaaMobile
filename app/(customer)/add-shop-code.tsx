import Feather from "@expo/vector-icons/Feather";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";

import { meApi } from "@/api/endpoints/me";
import { isApiError, messageFor } from "@/api/errors";
import { shopCodeChanges } from "@/api/query-keys";
import type { RedeemedCode } from "@/api/types";
import { Banner, Button, CodeInput, Screen, Text, type CodeInputHandle } from "@/components/ui";
import { FormScreen } from "@/components/FormScreen";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { SHOP_CODE_LENGTH, shopCodeFromText } from "@/lib/validation";
import { useTheme } from "@/theme";

/**
 * C30 · Add a shop code. Spec: docs/04-screens-customer.md — C30.
 *
 * The 8-character code a shop hands over at the counter (or on WhatsApp — a pasted
 * message gives up its code). Adds the shop's rooms; the rooms and boards already on
 * the account stay. Each refusal is the server's own sentence.
 */
export default function AddShopCode() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, space } = useTheme();
  const codeRef = useRef<CodeInputHandle>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<RedeemedCode | null>(null);
  const { busy, run } = useSubmit();

  const submit = () => {
    if (code.length !== SHOP_CODE_LENGTH) return;
    void run(async () => {
      setError(null);
      try {
        const redeemed = await meApi.redeemCode(code);
        // A code changes the balance, the companies on show and what the shop unlocked.
        await Promise.all(shopCodeChanges.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
        setAdded(redeemed);
      } catch (err) {
        setError(isApiError(err) && err.status === 404 ? t("addCode.unknown") : messageFor(err));
        codeRef.current?.shake();
      }
    });
  };

  if (added) {
    const rooms = added.projectsRemaining ?? added.projectQuota ?? 0;
    const shop = added.organizationName?.trim() || t("addCode.yourShop");
    return (
      <Screen
        scroll
        footer={
          <View style={{ gap: space.xs }}>
            <Button label={t("addCode.start")} onPress={() => router.replace("/room/new")} />
            <Button variant="ghost" label={t("addCode.home")} onPress={() => router.replace("/home")} />
          </View>
        }
      >
        <View style={{ gap: space.md, marginTop: space.huge }}>
          <Feather name="check-circle" size={44} color={colors.successText} />
          <Text variant="title1" accessibilityRole="header">
            {t("addCode.doneTitle")}
          </Text>
          <Text variant="lead" accessibilityLiveRegion="polite">
            {rooms > 1
              ? t("addCode.doneRooms", { shop, n: rooms })
              : rooms === 1
                ? t("addCode.doneOneRoom", { shop })
                : t("addCode.doneShop")}
          </Text>
          <Text variant="body" tone="soft">
            {t("addCode.keep")}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <FormScreen
      title={t("addCode.title")}
      lead={t("addCode.lead")}
      backFallback="/home"
      footer={<Button label={t("addCode.submit")} onPress={submit} disabled={code.length !== SHOP_CODE_LENGTH} loading={busy} />}
    >
      <CodeInput
        ref={codeRef}
        label={t("addCode.label")}
        value={code}
        length={SHOP_CODE_LENGTH}
        alphanumeric={{ clean: shopCodeFromText }}
        onChange={(next) => {
          setCode(next);
          if (error) setError(null);
        }}
        editable={!busy}
        testID="shop-code"
      />
      {error ? <Banner tone="danger" message={error} /> : null}
    </FormScreen>
  );
}
