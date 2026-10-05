import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { type TextInput } from "react-native";

import { authApi } from "@/api/endpoints/auth";
import { isApiError, messageFor } from "@/api/errors";
import { useSession } from "@/auth/session";
import { FormScreen } from "@/components/FormScreen";
import { Banner, Button, TextField, useToast } from "@/components/ui";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { validateNewPassword } from "@/lib/validation";

/**
 * S5 · Password. Spec: docs/06-screens-shared.md — S5.
 *
 * Change it (current + new), or set a first one on a mobile or walk-in account — which
 * signs in beside a confirmed email, so that comes first. Google accounts have no
 * HueVistaa password at all. Either change signs out every device, this one included,
 * so it ends on the email sign-in with the address filled in.
 */
export default function Password() {
  const router = useRouter();
  const toast = useToast();
  const { profile, signOut } = useSession();
  const newRef = useRef<TextInput>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [tried, setTried] = useState(false);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmit();

  if (!profile) return null;
  const changing = Boolean(profile.hasPassword);
  const title = changing ? t("passwordScreen.titleChange") : t("passwordScreen.titleSet");

  if (profile.linkedProfile || (profile.provider === "GOOGLE" && !changing)) {
    return (
      <FormScreen title={title} backFallback="/account">
        <Banner tone="info" message={profile.linkedProfile ? t("account.linkedNote") : t("passwordScreen.google")} />
      </FormScreen>
    );
  }
  if (!changing && (!profile.email || !profile.emailVerified)) {
    return (
      <FormScreen
        title={title}
        lead={t("passwordScreen.leadSet")}
        backFallback="/account"
        footer={<Button label={t("passwordScreen.toEmail")} onPress={() => router.replace("/verify-email")} />}
      >
        <Banner tone="info" message={t("passwordScreen.needsEmail")} />
      </FormScreen>
    );
  }

  const nextKey = validateNewPassword(next);
  const save = () => {
    setTried(true);
    if (nextKey || (changing && !current)) return;
    void run(async () => {
      setError(null);
      setCurrentError(null);
      setNextError(null);
      try {
        if (changing) await authApi.changePassword({ currentPassword: current, newPassword: next });
        else await authApi.setPassword(next);
        // The backend has just ended every session, this one too.
        toast.show(changing ? t("passwordScreen.changed") : t("passwordScreen.set"), "success");
        const email = profile.email ?? "";
        await signOut({
          serverAlreadyKnows: true,
          landing: email ? `/email-sign-in?email=${encodeURIComponent(email)}` : "/email-sign-in",
        });
      } catch (err) {
        const fields = isApiError(err) ? err.fieldErrors : undefined;
        if (fields?.currentPassword) setCurrentError(fields.currentPassword);
        if (fields?.newPassword) setNextError(fields.newPassword);
        if (fields?.currentPassword || fields?.newPassword) return;
        if (isApiError(err) && err.status === 400 && /current password/i.test(err.message)) setCurrentError(err.message);
        else setError(messageFor(err));
      }
    });
  };

  return (
    <FormScreen
      title={title}
      lead={changing ? t("passwordScreen.leadChange") : t("passwordScreen.leadSet")}
      backFallback="/account"
      footer={<Button label={t("passwordScreen.save")} onPress={save} loading={busy} />}
    >
      {changing ? (
        <TextField
          label={t("passwordScreen.current")}
          value={current}
          onChangeText={(v) => {
            setCurrent(v);
            setCurrentError(null);
          }}
          error={currentError ?? (tried && !current ? t("passwordScreen.current") : null)}
          revealable
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => newRef.current?.focus()}
          autoFocus
        />
      ) : null}
      <TextField
        ref={newRef}
        label={t("fields.newPassword")}
        value={next}
        onChangeText={(v) => {
          setNext(v);
          setNextError(null);
        }}
        hint={t("validation.passwordHint")}
        error={nextError ?? (tried && nextKey ? t(nextKey) : null)}
        revealable
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={save}
        autoFocus={!changing}
      />
      {error ? <Banner tone="danger" message={error} /> : null}
    </FormScreen>
  );
}
