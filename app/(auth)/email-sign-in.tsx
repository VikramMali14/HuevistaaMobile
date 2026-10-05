import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { type TextInput, View } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { isApiError } from "@/api/errors";
import { Banner, Button, TextField } from "@/components/ui";
import { AdminBanner } from "@/features/auth/AdminBanner";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { authErrorMessage } from "@/features/auth/errors";
import { deviceToken } from "@/features/auth/sign-in";
import { useFinishSignIn } from "@/features/auth/use-finish-sign-in";
import { t } from "@/i18n";
import { validateEmail } from "@/lib/validation";
import { useTheme } from "@/theme";

/**
 * A5 · Sign in with email. Spec: docs/03-screens-auth.md — A5.
 *
 * A wrong password and an unknown email get the same sentence — the backend does not
 * reveal which accounts exist, and neither does the app.
 */
export default function EmailSignIn() {
  const router = useRouter();
  const { space } = useTheme();
  const finish = useFinishSignIn();
  const params = useLocalSearchParams<{ email?: string }>();

  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState(params.email ?? "");
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  // A7 comes back here (dismissTo) with the address it reset: take it, and clear the
  // old password, which no longer works.
  const [seenEmailParam, setSeenEmailParam] = useState(params.email);
  if (params.email !== seenEmailParam) {
    setSeenEmailParam(params.email);
    if (params.email) {
      setEmail(params.email);
      setPassword("");
      setError(null);
    }
  }

  const emailKey = validateEmail(email);
  const emailError = tried && emailKey ? t(emailKey) : null;

  async function signIn() {
    setTried(true);
    if (emailKey || !password || busy) return;
    setBusy(true);
    setError(null);
    setAdmin(false);
    try {
      const response = await authApi.login({
        email: email.trim(),
        password,
        deviceToken: await deviceToken(),
      });
      const outcome = await finish(response);
      if (outcome.kind === "admin") setAdmin(true);
    } catch (err) {
      setError(
        isApiError(err) && err.kind === "http" && err.status === 401
          ? t("auth.email.badCredentials")
          : authErrorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title={t("auth.email.title")}
      footer={
        <View style={{ gap: space.xs }}>
          <Button label={t("auth.email.submit")} onPress={signIn} disabled={!email.trim() || !password} loading={busy} />
          <Button
            variant="ghost"
            label={t("auth.email.createAccount")}
            onPress={() => router.push({ pathname: "/register", params: email.trim() ? { email: email.trim() } : {} })}
          />
        </View>
      }
    >
      <TextField
        label={t("fields.email")}
        value={email}
        onChangeText={(next) => {
          setEmail(next);
          setError(null);
        }}
        error={emailError}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        autoFocus={!params.email}
      />
      <View style={{ gap: space.xs }}>
        <TextField
          ref={passwordRef}
          label={t("fields.password")}
          value={password}
          onChangeText={(next) => {
            setPassword(next);
            setError(null);
          }}
          revealable
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={signIn}
          autoFocus={Boolean(params.email)}
        />
        <Button
          variant="ghost"
          block={false}
          label={t("auth.email.forgot")}
          onPress={() =>
            router.push({ pathname: "/forgot-password", params: email.trim() ? { email: email.trim() } : {} })
          }
        />
      </View>

      {error ? <Banner tone="danger" message={error} /> : null}
      {admin ? <AdminBanner /> : null}
    </AuthScreen>
  );
}
