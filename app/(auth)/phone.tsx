import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { authApi } from "@/api/endpoints/auth";
import { Banner, Button, PhoneField } from "@/components/ui";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { authErrorMessage, fieldError } from "@/features/auth/errors";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { isIndianMobile, mobileDigits, toE164India } from "@/lib/validation";

/**
 * A3 · Your mobile number. Spec: docs/03-screens-auth.md — A3.
 *
 * The answer to "text me a code" is the same whether or not the number has an account,
 * and this screen never implies either — that would let anyone ask which numbers are
 * registered.
 */
export default function PhoneNumber() {
  const router = useRouter();
  const params = useLocalSearchParams<{ digits?: string }>();
  const [digits, setDigits] = useState(() => mobileDigits(params.digits ?? "").slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { busy, run } = useSubmit();

  const complete = digits.length === 10;
  const valid = isIndianMobile(digits);
  // Only complain once ten digits are in and they still are not a mobile number.
  const shownError = error ?? (complete && !valid ? t("validation.mobile") : null);

  const send = () => {
    if (!valid) return;
    void run(async () => {
      setError(null);
      setFormError(null);
      const phone = toE164India(digits);
      try {
        const sent = await authApi.phoneStart(phone);
        router.push({
          pathname: "/phone-code",
          params: { phone, resendAfter: String(sent.resendAfterSeconds) },
        });
      } catch (err) {
        const onField = fieldError(err, "phone");
        if (onField) setError(onField);
        else setFormError(authErrorMessage(err));
      }
    });
  };

  return (
    <AuthScreen
      title={t("auth.phone.title")}
      lead={t("auth.phone.lead")}
      footer={<Button label={t("auth.phone.send")} onPress={send} disabled={!valid} loading={busy} />}
    >
      <PhoneField
        label={t("fields.mobile")}
        value={digits}
        onChangeDigits={(next) => {
          setDigits(next);
          setError(null);
        }}
        error={shownError}
        autoFocus
        returnKeyType="send"
        onSubmitEditing={send}
      />
      {formError ? <Banner tone="danger" message={formError} /> : null}
    </AuthScreen>
  );
}
