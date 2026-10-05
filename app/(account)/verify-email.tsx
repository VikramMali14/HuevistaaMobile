import { useState } from "react";

import { authApi } from "@/api/endpoints/auth";
import { useSession } from "@/auth/session";
import { TextField } from "@/components/ui";
import { VerifyFlow } from "@/features/account/VerifyFlow";
import { t } from "@/i18n";
import { validateEmail } from "@/lib/validation";

/**
 * S3 · Email. Spec: docs/06-screens-shared.md — S3.
 *
 * Add an email, confirm the one on the account, or change it — a code goes to the
 * address, and nothing changes on the account until it comes back.
 */
export default function VerifyEmail() {
  const { profile } = useSession();
  const [email, setEmail] = useState("");
  const valid = !validateEmail(email);

  return (
    <VerifyFlow
      title={t("emailScreen.title")}
      current={profile?.email ?? null}
      verified={Boolean(profile?.emailVerified)}
      blocked={profile?.linkedProfile ? t("account.linkedNote") : null}
      strings={{
        leadAdd: "emailScreen.leadAdd",
        leadConfirm: "emailScreen.leadConfirm",
        leadVerified: "emailScreen.leadVerified",
        current: "emailScreen.current",
        change: "emailScreen.change",
        send: "emailScreen.send",
        sentTo: "emailScreen.sentTo",
        confirm: "emailScreen.confirm",
        resend: "emailScreen.resend",
        confirmed: "emailScreen.confirmed",
        different: "emailScreen.differentEmail",
      }}
      inputReady={valid}
      renderInput={({ error, submit, clearError }) => (
        <TextField
          label={profile?.email ? t("emailScreen.newEmail") : t("fields.email")}
          value={email}
          onChangeText={(next) => {
            setEmail(next);
            clearError();
          }}
          error={error}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={submit}
          autoFocus
        />
      )}
      send={(toNew) => authApi.sendEmailCode(toNew ? email.trim() : undefined)}
      confirm={(code) => authApi.confirmEmailCode(code)}
    />
  );
}
