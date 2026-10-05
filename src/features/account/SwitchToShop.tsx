import { useState } from "react";

import { authApi } from "@/api/endpoints/auth";
import { messageFor } from "@/api/errors";
import { tokens } from "@/api/instance";
import { useSession } from "@/auth/session";
import { Button, CodeInput, ConfirmSheet, Sheet, Text } from "@/components/ui";
import { authErrorMessage } from "@/features/auth/errors";
import { deviceToken, finishSignIn } from "@/features/auth/sign-in";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";

/**
 * C5 "Switch back to your shop", for a shop's customer profile (switchTo = SHOP).
 *
 * Going back into the shop asks for the shop's emailed code unless this phone confirmed
 * one in the last 30 days. A8 cannot take that code: it lives in the signed-out screens,
 * which send a signed-in session away — so it is taken here, in a sheet. Once the shop
 * session opens, the customer screens' guard moves on to the web-only screen (S10).
 */
export function SwitchToShop({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { completeSignIn } = useSession();
  const switching = useSubmit();
  const confirming = useSubmit();
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{ token: string; hint: string | null } | null>(null);
  const [code, setCode] = useState("");

  const close = () => {
    setError(null);
    setChallenge(null);
    setCode("");
    onClose();
  };

  const start = () =>
    void switching.run(async () => {
      setError(null);
      try {
        const response = await authApi.switchProfile({
          deviceToken: await deviceToken(),
          refreshToken: tokens.refreshToken ?? undefined,
        });
        const outcome = await finishSignIn(response, completeSignIn);
        if (outcome.kind === "emailCode") setChallenge({ token: outcome.challengeToken, hint: outcome.emailHint });
        else if (outcome.kind !== "signedIn") setError(t("errors.generic"));
      } catch (err) {
        setError(messageFor(err));
      }
    });

  const confirm = (entered: string) => {
    if (!challenge || entered.length !== 6) return;
    void confirming.run(async () => {
      setError(null);
      try {
        await finishSignIn(await authApi.shopEmailCode({ challengeToken: challenge.token, code: entered }), completeSignIn);
      } catch (err) {
        setError(authErrorMessage(err));
        setCode("");
      }
    });
  };

  if (challenge) {
    return (
      <Sheet visible={visible} onClose={close} title={t("account.switchCodeTitle")}>
        <Text variant="body" tone="soft">
          {challenge.hint ? t("auth.shopCode.sentTo", { hint: challenge.hint }) : t("auth.shopCode.sentToGeneric")}
        </Text>
        <CodeInput
          label={t("fields.code")}
          value={code}
          onChange={(next) => {
            setCode(next);
            setError(null);
          }}
          onComplete={confirm}
          error={error}
          editable={!confirming.busy}
          testID="switch-code"
        />
        <Button label={t("common.continue")} onPress={() => confirm(code)} disabled={code.length !== 6} loading={confirming.busy} />
      </Sheet>
    );
  }

  return (
    <ConfirmSheet
      visible={visible}
      title={t("account.switchBackTitle")}
      body={t("account.switchBackBody")}
      confirmLabel={t("account.switchBackConfirm")}
      loading={switching.busy}
      error={error}
      onConfirm={start}
      onCancel={close}
    />
  );
}
