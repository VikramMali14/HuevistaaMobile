import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { Banner, Button, CodeInput, Text, useToast, type CodeInputHandle } from "@/components/ui";
import { AdminBanner } from "@/features/auth/AdminBanner";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { authErrorMessage } from "@/features/auth/errors";
import { deviceToken } from "@/features/auth/sign-in";
import { formatCountdown, secondsParam, useCountdown } from "@/features/auth/use-countdown";
import { useFinishSignIn } from "@/features/auth/use-finish-sign-in";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { formatMobileForDisplay, isIndianMobile } from "@/lib/validation";
import { useTheme } from "@/theme";

/**
 * A4 · Enter the code. Spec: docs/03-screens-auth.md — A4.
 *
 * Six boxes with SMS autofill; submits by itself on the sixth digit. A number the backend
 * has never seen becomes a new account in the same step. Resend counts down on the
 * server's own number.
 *
 * The number is shown in full, as typed: it is the person's own, on their own phone, and
 * seeing "+91 98765 43120" is how a typo gets noticed before the code never arrives.
 */
export default function PhoneCode() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string; resendAfter?: string }>();
  const phone = params.phone ?? "";

  // Opened without a number (a stale link, or the app was restarted part-way).
  if (!isIndianMobile(phone)) {
    return (
      <AuthScreen title={t("auth.code.title")} backFallback="/phone">
        <Banner tone="warning" message={t("auth.code.lost")}>
          <Button
            variant="secondary"
            block={false}
            label={t("auth.code.enterNumber")}
            onPress={() => router.replace("/phone")}
          />
        </Banner>
      </AuthScreen>
    );
  }
  return <CodeForPhone phone={phone} resendAfter={secondsParam(params.resendAfter, 30)} />;
}

function CodeForPhone({ phone, resendAfter }: { phone: string; resendAfter: number }) {
  const router = useRouter();
  const toast = useToast();
  const { space } = useTheme();
  const finish = useFinishSignIn();
  const verifying = useSubmit();
  const resending = useSubmit();

  const codeRef = useRef<CodeInputHandle>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const countdown = useCountdown(resendAfter);

  const verify = (entered: string) => {
    if (entered.length !== 6) return;
    void verifying.run(async () => {
      setError(null);
      setResendError(null);
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
      }
    });
  };

  const resend = () => {
    if (!countdown.done) return;
    void resending.run(async () => {
      setError(null);
      setResendError(null);
      try {
        const sent = await authApi.phoneStart(phone);
        countdown.restart(sent.resendAfterSeconds);
        setCode("");
        toast.show(t("auth.code.resent"), "success");
        codeRef.current?.focus();
      } catch (err) {
        // About sending, not about the code — kept off the boxes.
        setResendError(authErrorMessage(err));
      }
    });
  };

  return (
    <AuthScreen
      title={t("auth.code.title")}
      lead={t("auth.code.sentTo", { phone: `+91 ${formatMobileForDisplay(phone)}` })}
      backFallback="/phone"
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
        testID="phone-code-input"
      />

      {admin ? <AdminBanner /> : null}
      {resendError ? <Banner tone="danger" message={resendError} /> : null}

      <View style={{ gap: space.xs }}>
        {countdown.done ? (
          <Button variant="ghost" block={false} label={t("auth.code.resend")} onPress={resend} loading={resending.busy} />
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
