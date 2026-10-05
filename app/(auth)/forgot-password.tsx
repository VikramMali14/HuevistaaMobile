import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { type TextInput, View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import {
  Banner,
  Button,
  CodeInput,
  PhoneField,
  Segmented,
  Text,
  TextField,
  useToast,
  type CodeInputHandle,
} from "@/components/ui";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { authErrorMessage, fieldError } from "@/features/auth/errors";
import { formatCountdown, useCountdown } from "@/features/auth/use-countdown";
import { t } from "@/i18n";
import { formatMobileForDisplay, toE164India, validateEmail, validateMobile, validateNewPassword } from "@/lib/validation";
import { useTheme } from "@/theme";

type Channel = "email" | "mobile";

/** The backend lets a reset code be asked for again after this long. */
const RESEND_AFTER = 30;

/**
 * A7 · Forgot password. Spec: docs/03-screens-auth.md — A7.
 *
 * Both halves on one screen, like the website: the address stays typed and the second
 * half appears beneath it. "If an account uses this, we've sent it a code" either way —
 * the answer never says whether an account exists.
 */
export default function ForgotPassword() {
  const router = useRouter();
  const toast = useToast();
  const { space } = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();

  const codeRef = useRef<CodeInputHandle>(null);
  const passwordRef = useRef<TextInput>(null);
  const [channel, setChannel] = useState<Channel>("email");
  const [email, setEmail] = useState(params.email ?? "");
  const [digits, setDigits] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [triedSend, setTriedSend] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const countdown = useCountdown(RESEND_AFTER);

  const addressKey = channel === "email" ? validateEmail(email) : validateMobile(digits);
  const addressError = triedSend && addressKey ? t(addressKey) : null;
  const passwordKey = validateNewPassword(password);
  const shownPasswordError = passwordError ?? (triedSave && passwordKey ? t(passwordKey) : null);

  async function send(again = false) {
    setTriedSend(true);
    if (addressKey || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (channel === "email") await authApi.forgotPassword(email.trim());
      else await authApi.forgotPasswordByPhone(toE164India(digits));
      setSent(true);
      setCode("");
      setCodeError(null);
      countdown.restart(RESEND_AFTER);
      if (again) toast.show(t("auth.code.resent"), "success");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setTriedSave(true);
    if (code.length !== 6) {
      setCodeError(t("auth.forgot.codeNeeded"));
      codeRef.current?.focus();
      return;
    }
    if (passwordKey || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (channel === "email") {
        await authApi.resetPassword({ email: email.trim(), code, newPassword: password });
        toast.show(t("auth.forgot.changed"), "success");
        router.dismissTo({ pathname: "/email-sign-in", params: { email: email.trim() } });
      } else {
        await authApi.resetPasswordByPhone({ phone: toE164India(digits), code, newPassword: password });
        toast.show(t("auth.forgot.changedByMobile"), "success");
        router.replace({ pathname: "/phone", params: { digits } });
      }
    } catch (err) {
      const onPassword = fieldError(err, "newPassword");
      const onCode = fieldError(err, "code");
      if (onPassword) setPasswordError(onPassword);
      if (onCode) setCodeError(onCode);
      if (!onPassword && !onCode) {
        // A wrong or expired code is the usual reason — say it at the boxes.
        setCodeError(authErrorMessage(err));
        setCode("");
        codeRef.current?.shake();
      }
    } finally {
      setBusy(false);
    }
  }

  function startAgain() {
    setSent(false);
    setCode("");
    setPassword("");
    setCodeError(null);
    setPasswordError(null);
    setTriedSave(false);
    setError(null);
  }

  const sentTo = channel === "email" ? email.trim() : `+91 ${formatMobileForDisplay(digits)}`;

  return (
    <AuthScreen
      title={t("auth.forgot.title")}
      lead={sent ? t("auth.forgot.codeLead") : t("auth.forgot.lead")}
      backFallback="/email-sign-in"
      footer={
        sent ? (
          <Button label={t("auth.forgot.save")} onPress={save} loading={busy} />
        ) : (
          <Button label={t("auth.forgot.send")} onPress={() => send()} loading={busy} />
        )
      }
    >
      {!sent ? (
        <>
          <View style={{ gap: space.xs }}>
            <Text variant="fieldLabel">{t("auth.forgot.sendTo")}</Text>
            <Segmented
              accessibilityLabel={t("auth.forgot.sendTo")}
              options={[
                { value: "email", label: t("auth.forgot.byEmail") },
                { value: "mobile", label: t("auth.forgot.byMobile") },
              ]}
              value={channel}
              onChange={(next) => {
                setChannel(next);
                setTriedSend(false);
                setError(null);
              }}
            />
          </View>
          {channel === "email" ? (
            <TextField
              label={t("fields.email")}
              value={email}
              onChangeText={(next) => {
                setEmail(next);
                setError(null);
              }}
              error={addressError}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              returnKeyType="send"
              onSubmitEditing={() => send()}
            />
          ) : (
            <PhoneField
              label={t("fields.mobile")}
              value={digits}
              onChangeDigits={(next) => {
                setDigits(next);
                setError(null);
              }}
              error={addressError}
              returnKeyType="send"
              onSubmitEditing={() => send()}
            />
          )}
        </>
      ) : (
        <>
          <Banner tone="success" title={sentTo} message={t("auth.forgot.sentEither")} />
          <CodeInput
            ref={codeRef}
            label={t("fields.code")}
            value={code}
            onChange={(next) => {
              setCode(next);
              setCodeError(null);
            }}
            onComplete={() => passwordRef.current?.focus()}
            error={codeError}
            editable={!busy}
            autoFocus
            testID="reset-code-input"
          />
          <TextField
            ref={passwordRef}
            label={t("fields.newPassword")}
            value={password}
            onChangeText={(next) => {
              setPassword(next);
              setPasswordError(null);
            }}
            hint={t("validation.passwordHint")}
            error={shownPasswordError}
            revealable
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <View style={{ gap: space.xs }}>
            {countdown.done ? (
              <Button
                variant="ghost"
                block={false}
                label={t("auth.forgot.resend")}
                onPress={() => send(true)}
                disabled={busy}
              />
            ) : (
              <Text variant="small" tone="mute" accessibilityLiveRegion="polite">
                {t("auth.code.resendIn", { time: formatCountdown(countdown.left) })}
              </Text>
            )}
            <Button variant="ghost" block={false} label={t("auth.forgot.startAgain")} onPress={startAgain} />
          </View>
        </>
      )}
      {error ? <Banner tone="danger" message={error} /> : null}
    </AuthScreen>
  );
}
