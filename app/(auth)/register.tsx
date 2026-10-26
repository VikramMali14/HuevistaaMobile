import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { type TextInput, View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { isApiError } from "@/api/errors";
import { Banner, Button, CodeInput, PhoneField, Text, TextField, type CodeInputHandle } from "@/components/ui";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { authErrorMessage, fieldError, isPhoneInUse, isPhoneOnUnconfirmedAccount } from "@/features/auth/errors";
import { formatCountdown, useCountdown } from "@/features/auth/use-countdown";
import { useFinishSignIn } from "@/features/auth/use-finish-sign-in";
import { t, type MessageKey } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import {
  NAME_MAX,
  formatMobileForDisplay,
  toE164India,
  validateEmail,
  validateMobile,
  validateName,
  validateNewPassword,
} from "@/lib/validation";
import { useTheme } from "@/theme";

type Field = "name" | "email" | "password" | "phone" | "code";

const say = (key: MessageKey | null) => (key ? t(key) : undefined);

/** The backend's answer when the address already has an account (409). */
function isEmailTaken(err: unknown): boolean {
  return isApiError(err) && err.kind === "http" && err.status === 409 && /email/i.test(err.message);
}

/**
 * A6 · Create an account with email. Spec: docs/03-screens-auth.md — A6.
 *
 * Every public sign-up is a customer; the role question comes next, in A10. The password
 * rule is shown before anyone breaks it.
 *
 * A mobile typed here is confirmed before the account exists: the first press texts a
 * code, and the code — on its sixth digit — opens the account with the number confirmed.
 * Stored unconfirmed, as it used to be, it was a trap: the owner's own mobile sign-in
 * later met "this number is on an account that hasn't confirmed it", and "This isn't my
 * account" took the number off their account and opened an empty one beside it.
 */
export default function Register() {
  const router = useRouter();
  const { space } = useTheme();
  const finish = useFinishSignIn();
  const params = useLocalSearchParams<{ email?: string }>();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const codeRef = useRef<CodeInputHandle>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(params.email ?? "");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [tried, setTried] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  /** The +91 number the last code went to. The code step belongs to that number alone. */
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [code, setCode] = useState("");
  /** The code was right, but an account holds the number unconfirmed: kept for "not mine". */
  const [elsewhere, setElsewhere] = useState<string | null>(null);
  /** The code was right, but the number already signs in to another account. */
  const [phoneInUse, setPhoneInUse] = useState(false);
  const countdown = useCountdown(0);
  const { busy, run } = useSubmit();
  const resending = useSubmit();

  const local: Partial<Record<Field, string>> = {
    name: say(validateName(name)),
    email: say(validateEmail(email)),
    password: say(validateNewPassword(password)),
    phone: phone ? say(validateMobile(phone)) : undefined,
  };
  const hasLocalError = Object.values(local).some(Boolean);
  const errorFor = (field: Field) => serverErrors[field] ?? (tried ? (local[field] ?? null) : null);
  const typedPhone = phone ? toE164India(phone) : null;
  const codeStep = typedPhone !== null && codeFor === typedPhone;

  function edit(field: Field) {
    setServerErrors(({ [field]: _gone, ...rest }) => rest);
    setError(null);
    if (field === "email") setEmailTaken(false);
    if (field === "phone") setPhoneInUse(false);
  }

  /** Text a code to the typed number — the first step when there is one. */
  const sendCode = async (to: string) => {
    try {
      const sent = await authApi.phoneStart(to);
      setCodeFor(to);
      setCode("");
      setElsewhere(null);
      countdown.restart(sent.resendAfterSeconds);
      // A resend: the boxes are already there. The first time, they open focused.
      codeRef.current?.focus();
    } catch (err) {
      const onField = fieldError(err, "phone");
      if (onField) setServerErrors({ phone: onField });
      else setError(authErrorMessage(err));
    }
  };

  const create = (entered = code, notMyAccount = false) => {
    setTried(true);
    if (hasLocalError) return;
    void run(async () => {
      setError(null);
      setEmailTaken(false);
      setPhoneInUse(false);
      setServerErrors({});
      if (typedPhone && !codeStep) {
        await sendCode(typedPhone);
        return;
      }
      if (typedPhone && entered.length !== 6) {
        codeRef.current?.focus();
        return;
      }
      // Sent again from the banner: it stays up while that's asked, so its button can spin.
      if (!notMyAccount) setElsewhere(null);
      try {
        const response = await authApi.register({
          name: name.trim(),
          email: email.trim(),
          password,
          ...(typedPhone ? { phone: typedPhone, phoneCode: entered } : {}),
          ...(notMyAccount ? { notMyAccount: true } : {}),
        });
        await finish(response);
        // The new account goes on to A10 (the (auth) layout sees the first run).
      } catch (err) {
        // Before the email check: this refusal's words mention email too.
        if (isPhoneOnUnconfirmedAccount(err)) {
          setElsewhere(entered);
          return;
        }
        setElsewhere(null);
        if (isPhoneInUse(err)) {
          setPhoneInUse(true);
          setServerErrors({ phone: t("auth.register.phoneInUse") });
          return;
        }
        if (isEmailTaken(err)) {
          setEmailTaken(true);
          return;
        }
        const onFields: Partial<Record<Field, string>> = {};
        for (const field of ["name", "email", "password", "phone"] as const) {
          const message = fieldError(err, field);
          if (message) onFields[field] = message;
        }
        const onCode = fieldError(err, "phoneCode");
        if (onCode) onFields.code = onCode;
        if (Object.keys(onFields).length > 0) setServerErrors(onFields);
        else if (typedPhone && isApiError(err) && err.kind === "http" && err.status === 400) {
          // The number was taken when the code went out, so a 400 now is the code's:
          // wrong, expired or used up. Said at the boxes, which are emptied for another go.
          setServerErrors({ code: authErrorMessage(err) });
          setCode("");
          codeRef.current?.shake();
          codeRef.current?.focus();
        } else setError(authErrorMessage(err));
      }
    });
  };

  const resend = () => {
    if (!typedPhone || !countdown.done) return;
    void resending.run(async () => {
      setError(null);
      setServerErrors({});
      await sendCode(typedPhone);
    });
  };

  /** Back to A5 — the one already in the stack when there is one — with the email. */
  const toSignIn = () =>
    router.dismissTo({ pathname: "/email-sign-in", params: email.trim() ? { email: email.trim() } : {} });

  return (
    <AuthScreen
      title={t("auth.register.title")}
      backFallback="/email-sign-in"
      footer={
        <View style={{ gap: space.xs }}>
          <Button
            label={typedPhone && !codeStep ? t("auth.phone.send") : t("auth.register.submit")}
            onPress={() => create()}
            loading={busy}
          />
          <Button
            variant="ghost"
            label={t("auth.register.haveAccount")}
            onPress={toSignIn}
          />
        </View>
      }
    >
      <TextField
        label={t("fields.name")}
        value={name}
        onChangeText={(next) => {
          setName(next);
          edit("name");
        }}
        error={errorFor("name")}
        autoCapitalize="words"
        maxLength={NAME_MAX}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
        autoFocus
      />
      <TextField
        ref={emailRef}
        label={t("fields.email")}
        value={email}
        onChangeText={(next) => {
          setEmail(next);
          edit("email");
        }}
        error={errorFor("email")}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      {emailTaken ? (
        <Banner tone="warning" message={t("auth.register.emailTaken")}>
          <Button
            variant="secondary"
            block={false}
            label={t("auth.register.signInInstead")}
            onPress={toSignIn}
          />
        </Banner>
      ) : null}
      <TextField
        ref={passwordRef}
        label={t("fields.password")}
        value={password}
        onChangeText={(next) => {
          setPassword(next);
          edit("password");
        }}
        hint={t("validation.passwordHint")}
        error={errorFor("password")}
        revealable
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => phoneRef.current?.focus()}
      />
      <PhoneField
        ref={phoneRef}
        label={t("fields.mobileOptional")}
        value={phone}
        onChangeDigits={(next) => {
          setPhone(next);
          edit("phone");
        }}
        error={errorFor("phone")}
        hint={t("auth.register.mobileHint")}
        returnKeyType="done"
        onSubmitEditing={() => create()}
      />
      {phoneInUse ? (
        <Button
          variant="secondary"
          block={false}
          label={t("auth.register.signInWithMobile")}
          onPress={() => router.push({ pathname: "/phone", params: { digits: phone } })}
        />
      ) : null}
      {codeStep && typedPhone ? (
        <View style={{ gap: space.xs }}>
          <Text variant="small" tone="mute">
            {t("auth.code.sentTo", { phone: `+91 ${formatMobileForDisplay(typedPhone)}` })}
          </Text>
          <CodeInput
            ref={codeRef}
            label={t("fields.code")}
            value={code}
            onChange={(next) => {
              setCode(next);
              edit("code");
            }}
            onComplete={(entered) => create(entered)}
            error={errorFor("code")}
            editable={!busy}
            autoFocus
            testID="register-code-input"
          />
          {countdown.done ? (
            <Button variant="ghost" block={false} label={t("auth.code.resend")} onPress={resend} loading={resending.busy} />
          ) : (
            <Text variant="small" tone="mute" accessibilityLiveRegion="polite">
              {t("auth.code.resendIn", { time: formatCountdown(countdown.left) })}
            </Text>
          )}
        </View>
      ) : null}
      {elsewhere && codeStep ? (
        <Banner tone="warning" message={t("auth.code.unconfirmedElsewhere")} testID="register-elsewhere">
          <Button variant="secondary" block={false} label={t("auth.code.useEmail")} onPress={toSignIn} disabled={busy} />
          {/* Second, and quieter: it takes the number off the other account. */}
          <Button
            variant="ghost"
            block={false}
            label={t("auth.code.notMine")}
            onPress={() => create(elsewhere, true)}
            loading={busy}
            testID="register-not-mine"
          />
        </Banner>
      ) : null}
      {error ? <Banner tone="danger" message={error} /> : null}
    </AuthScreen>
  );
}
