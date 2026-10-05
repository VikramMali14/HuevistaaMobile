import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { Banner, Button, CodeInput, Text, useToast, type CodeInputHandle } from "@/components/ui";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { authErrorMessage } from "@/features/auth/errors";
import { formatCountdown, useCountdown } from "@/features/auth/use-countdown";
import { useFinishSignIn } from "@/features/auth/use-finish-sign-in";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/** The backend allows a resend thirty seconds after the last code. */
const RESEND_AFTER = 30;

/**
 * A8 · Check your email (shops only). Spec: docs/03-screens-auth.md — A8.
 *
 * A shop signing in on a device it has not used in 30 days confirms an emailed code.
 * The answer carries a trusted-device token, which the session saves so this phone is
 * not asked again for 30 days. Each resend returns a new challenge, which replaces the
 * old one.
 */
export default function ShopEmailCode() {
  const router = useRouter();
  const toast = useToast();
  const { space } = useTheme();
  const finish = useFinishSignIn();
  const params = useLocalSearchParams<{ challenge?: string; hint?: string }>();

  const codeRef = useRef<CodeInputHandle>(null);
  const [challenge, setChallenge] = useState(params.challenge ?? "");
  const [hint, setHint] = useState(params.hint ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const verifying = useSubmit();
  const resending = useSubmit();
  const countdown = useCountdown(RESEND_AFTER);

  const verify = (entered: string) => {
    if (!challenge || entered.length !== 6) return;
    void verifying.run(async () => {
      setError(null);
      setResendError(null);
      try {
        const response = await authApi.shopEmailCode({ challengeToken: challenge, code: entered });
        await finish(response);
        // The (auth) layout takes the shop to S10.
      } catch (err) {
        setError(authErrorMessage(err));
        setCode("");
        codeRef.current?.shake();
        codeRef.current?.focus();
      }
    });
  };

  const resend = () => {
    if (!countdown.done || !challenge) return;
    void resending.run(async () => {
      setError(null);
      setResendError(null);
      try {
        const next = await authApi.shopEmailCodeResend(challenge);
        if (next.challengeToken) setChallenge(next.challengeToken);
        if (next.emailHint) setHint(next.emailHint);
        setCode("");
        countdown.restart(RESEND_AFTER);
        toast.show(t("auth.shopCode.resent"), "success");
        codeRef.current?.focus();
      } catch (err) {
        // About sending ("at most three resends…"), not about the code.
        setResendError(authErrorMessage(err));
      }
    });
  };

  // Opened without a pending sign-in (a stale link, or the app was restarted mid-way).
  if (!challenge) {
    return (
      <AuthScreen title={t("auth.shopCode.title")}>
        <Banner tone="warning" message={t("auth.shopCode.lost")}>
          <Button
            variant="secondary"
            block={false}
            label={t("auth.google.backToStart")}
            onPress={() => router.replace("/welcome")}
          />
        </Banner>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title={t("auth.shopCode.title")}
      lead={hint ? t("auth.shopCode.sentTo", { hint }) : t("auth.shopCode.sentToGeneric")}
      footer={
        <Button
          label={verifying.busy ? t("auth.code.verifying") : t("common.continue")}
          onPress={() => verify(code)}
          disabled={code.length !== 6}
          loading={verifying.busy}
        />
      }
    >
      <CodeInput
        ref={codeRef}
        label={t("fields.code")}
        value={code}
        onChange={(next) => {
          setCode(next);
          if (error) setError(null);
        }}
        onComplete={verify}
        error={error}
        editable={!verifying.busy}
        autoFocus
        testID="shop-code-input"
      />
      <Text variant="small" tone="soft">
        {t("auth.shopCode.why")}
      </Text>
      {resendError ? <Banner tone="danger" message={resendError} /> : null}
      <View>
        {countdown.done ? (
          <Button variant="ghost" block={false} label={t("auth.shopCode.resend")} onPress={resend} loading={resending.busy} />
        ) : (
          <Text variant="small" tone="mute" accessibilityLiveRegion="polite" style={{ paddingVertical: space.xs }}>
            {t("auth.code.resendIn", { time: formatCountdown(countdown.left) })}
          </Text>
        )}
      </View>
    </AuthScreen>
  );
}
