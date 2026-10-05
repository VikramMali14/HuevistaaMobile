import { useState } from "react";

import { authApi } from "@/api/endpoints/auth";
import { useSession } from "@/auth/session";
import { PhoneField } from "@/components/ui";
import { VerifyFlow } from "@/features/account/VerifyFlow";
import { t } from "@/i18n";
import { formatMobileForDisplay, isIndianMobile, toE164India } from "@/lib/validation";

/**
 * S4 · Mobile number. Spec: docs/06-screens-shared.md — S4.
 *
 * Add, confirm or change the mobile number — and say plainly that this number signs the
 * account in. Changing it is the same "send a code to the new number" step; the number
 * moves only once that code comes back.
 */
export default function MobileNumber() {
  const { profile } = useSession();
  const [digits, setDigits] = useState("");
  const current = profile?.phoneNumber ? `+91 ${formatMobileForDisplay(profile.phoneNumber)}` : null;

  return (
    <VerifyFlow
      title={t("mobileScreen.title")}
      current={current}
      verified={Boolean(profile?.phoneVerified)}
      blocked={profile?.linkedProfile ? t("account.linkedNote") : null}
      strings={{
        leadAdd: "mobileScreen.leadAdd",
        leadConfirm: "mobileScreen.lead",
        leadVerified: "mobileScreen.lead",
        current: "mobileScreen.current",
        change: "mobileScreen.change",
        send: "mobileScreen.send",
        sentTo: "mobileScreen.sentTo",
        confirm: "mobileScreen.confirm",
        resend: "mobileScreen.resend",
        confirmed: "mobileScreen.confirmed",
        different: "mobileScreen.differentNumber",
      }}
      inputReady={isIndianMobile(digits)}
      renderInput={({ error, submit, clearError }) => (
        <PhoneField
          label={current ? t("mobileScreen.newNumber") : t("fields.mobile")}
          value={digits}
          onChangeDigits={(next) => {
            setDigits(next);
            clearError();
          }}
          error={error ?? (digits.length === 10 && !isIndianMobile(digits) ? t("validation.mobile") : null)}
          returnKeyType="send"
          onSubmitEditing={submit}
          autoFocus
        />
      )}
      send={(toNew) => authApi.sendPhoneCode(toNew ? toE164India(digits) : undefined)}
      confirm={(code) => authApi.confirmPhoneCode(code)}
    />
  );
}
