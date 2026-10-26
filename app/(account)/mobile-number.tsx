import { useState } from "react";

import { authApi } from "@/api/endpoints/auth";
import { useSession } from "@/auth/session";
import { PhoneField } from "@/components/ui";
import { VerifyFlow } from "@/features/account/VerifyFlow";
import { isPhoneOnCustomerAccount } from "@/features/auth/errors";
import { t } from "@/i18n";
import { formatMobileForDisplay, isIndianMobile, toE164India } from "@/lib/validation";

/**
 * S4 · Mobile number. Spec: docs/06-screens-shared.md — S4.
 *
 * Add, confirm or change the mobile number — and say plainly that this number signs the
 * account in. Changing it is the same "send a code to the new number" step; the number
 * moves only once that code comes back.
 *
 * A number that already signs in to a separate customer account — a painter's own, from
 * before they started painting — is refused (PHONE_ON_CUSTOMER_ACCOUNT). The screen then
 * offers to move that account in: a code to the number folds it into this account's
 * customer profile and confirms the number here.
 */
export default function MobileNumber() {
  const { profile } = useSession();
  const [digits, setDigits] = useState("");
  const current = profile?.phoneNumber ? `+91 ${formatMobileForDisplay(profile.phoneNumber)}` : null;
  /** The number the refused send was for: the one typed in, or the one already on the account. */
  const target = () => (isIndianMobile(digits) ? toE164India(digits) : (profile?.phoneNumber ?? ""));

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
      move={{
        when: isPhoneOnCustomerAccount,
        send: () => authApi.sendPhoneMoveCode(target()),
        confirm: async (code) => (await authApi.confirmPhoneMove(code)).profile,
        offer: "mobileScreen.moveOffer",
        sentTo: "mobileScreen.moveSentTo",
        done: "mobileScreen.moved",
      }}
    />
  );
}
