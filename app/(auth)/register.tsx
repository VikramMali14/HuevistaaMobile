import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { type TextInput, View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { isApiError } from "@/api/errors";
import { Banner, Button, PhoneField, TextField } from "@/components/ui";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { authErrorMessage, fieldError } from "@/features/auth/errors";
import { useFinishSignIn } from "@/features/auth/use-finish-sign-in";
import { t, type MessageKey } from "@/i18n";
import { toE164India, validateEmail, validateMobile, validateNewPassword } from "@/lib/validation";
import { useTheme } from "@/theme";

type Field = "name" | "email" | "password" | "phone";

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
 */
export default function Register() {
  const router = useRouter();
  const { space } = useTheme();
  const finish = useFinishSignIn();
  const params = useLocalSearchParams<{ email?: string }>();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(params.email ?? "");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [tried, setTried] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [busy, setBusy] = useState(false);

  const local: Partial<Record<Field, string>> = {
    name: name.trim() ? undefined : t("validation.nameRequired"),
    email: say(validateEmail(email)),
    password: say(validateNewPassword(password)),
    phone: phone ? say(validateMobile(phone)) : undefined,
  };
  const hasLocalError = Object.values(local).some(Boolean);
  const errorFor = (field: Field) => serverErrors[field] ?? (tried ? (local[field] ?? null) : null);

  function edit(field: Field) {
    setServerErrors(({ [field]: _gone, ...rest }) => rest);
    setError(null);
    if (field === "email") setEmailTaken(false);
  }

  async function create() {
    setTried(true);
    if (hasLocalError || busy) return;
    setBusy(true);
    setError(null);
    setEmailTaken(false);
    setServerErrors({});
    try {
      const response = await authApi.register({
        name: name.trim(),
        email: email.trim(),
        password,
        ...(phone ? { phone: toE164India(phone) } : {}),
      });
      await finish(response);
      // The new account goes on to A10 (the (auth) layout sees the first run).
    } catch (err) {
      if (isEmailTaken(err)) {
        setEmailTaken(true);
        return;
      }
      const onFields: Partial<Record<Field, string>> = {};
      for (const field of ["name", "email", "password", "phone"] as const) {
        const message = fieldError(err, field);
        if (message) onFields[field] = message;
      }
      if (Object.keys(onFields).length > 0) setServerErrors(onFields);
      else setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title={t("auth.register.title")}
      backFallback="/email-sign-in"
      footer={
        <View style={{ gap: space.xs }}>
          <Button label={t("auth.register.submit")} onPress={create} loading={busy} />
          <Button
            variant="ghost"
            label={t("auth.register.haveAccount")}
            onPress={() => router.replace({ pathname: "/email-sign-in", params: email.trim() ? { email: email.trim() } : {} })}
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
            onPress={() => router.replace({ pathname: "/email-sign-in", params: { email: email.trim() } })}
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
        returnKeyType="done"
        onSubmitEditing={create}
      />
      {error ? <Banner tone="danger" message={error} /> : null}
    </AuthScreen>
  );
}
