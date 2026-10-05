import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { Button, CodeInput, Text, useToast, type CodeInputHandle } from "@/components/ui";
import { AdminBanner } from "@/features/auth/AdminBanner";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { authErrorMessage } from "@/features/auth/errors";
import { deviceToken } from "@/features/auth/sign-in";
import { formatCountdown, secondsParam, useCountdown } from "@/features/auth/use-countdown";
import { useFinishSignIn } from "@/features/auth/use-finish-sign-in";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * A4 · Enter the code. Spec: docs/03-screens-auth.md — A4.
 *
 * Six boxes with SMS autofill; submits by itself on the sixth digit. A number the backend
 * has never seen becomes a new account in the same step. Resend counts down on the
 * server's own number.
 */
export default function PhoneCode() {
  const router = useRouter();
  const toast = useToast();
  const { space } = useTheme();
  const finish = useFinishSignIn();
  const params = useLocalSearchParams<{ phone?: string; masked?: string; resendAfter?: string }>();
  const phone = params.phone ?? "";
  const masked = params.masked || phone;

  const codeRef = useRef<CodeInputHandle>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [admin, setAdmin] = useState(false);
  const countdown = useCountdown(secondsParam(params.resendAfter, 30));

  async function verify(entered: string) {
    if (busy || !phone) return;
    setBusy(true);
    setError(null);
    setAdmin(false);
    try {
      const response = await authApi.phoneVerify({ phone, code: entered, deviceToken: await deviceToken() });
      const outcome = await finish(response);
      if (outcome.kind === "admin") setAdmin(true);
      // signedIn: the (auth) layout moves on by itself.
    } catch (err) {
      setError(authErrorMessage(err));
      setCode("");
      codeRef.current?.shake();
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!countdown.done || resending) return;
    setResending(true);
    setError(null);
    try {
      const sent = await authApi.phoneStart(phone);
      countdown.restart(sent.resendAfterSeconds);
      setCode("");
      toast.show(t("auth.code.resent"), "success");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthScreen
      title={t("auth.code.title")}
      lead={t("auth.code.sentTo", { phone: masked })}
      backFallback="/phone"
      footer={
        <Button
          label={busy ? t("auth.code.verifying") : t("common.continue")}
          onPress={() => verify(code)}
          disabled={code.length !== 6}
          loading={busy}
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
        editable={!busy}
        testID="phone-code-input"
      />

      {admin ? <AdminBanner /> : null}

      <View style={{ gap: space.xs }}>
        {countdown.done ? (
          <Button variant="ghost" block={false} label={t("auth.code.resend")} onPress={resend} loading={resending} />
        ) : (
          <Text variant="small" tone="mute" accessibilityLiveRegion="polite">
            {t("auth.code.resendIn", { time: formatCountdown(countdown.left) })}
          </Text>
        )}
        <Button
          variant="ghost"
          block={false}
          label={t("auth.code.changeNumber")}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/phone"))}
        />
      </View>
    </AuthScreen>
  );
}
