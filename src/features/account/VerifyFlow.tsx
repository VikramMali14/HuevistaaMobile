import { useRouter } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import { View } from "react-native";

import { messageFor } from "@/api/errors";
import type { UserProfile, VerificationStatus } from "@/api/types";
import { useSession } from "@/auth/session";
import { FormScreen } from "@/components/FormScreen";
import { Banner, Button, CodeInput, ListGroup, ListRow, Text, useToast, type CodeInputHandle } from "@/components/ui";
import { authErrorMessage } from "@/features/auth/errors";
import { formatCountdown, useCountdown } from "@/features/auth/use-countdown";
import { t, type MessageKey } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";

type Step = "view" | "enter" | "code";

export interface VerifyFlowProps {
  title: string;
  /** The value on the account now, as it should be shown, or null. */
  current: string | null;
  verified: boolean;
  strings: {
    leadAdd: MessageKey;
    leadConfirm: MessageKey;
    leadVerified: MessageKey;
    current: MessageKey;
    change: MessageKey;
    send: MessageKey;
    sentTo: MessageKey;
    confirm: MessageKey;
    resend: MessageKey;
    confirmed: MessageKey;
    different: MessageKey;
  };
  /** The field for a new value; `submit` sends the code to it. */
  renderInput: (props: { error: string | null; submit: () => void; clearError: () => void }) => ReactNode;
  /** The typed value is complete enough to send to. */
  inputReady: boolean;
  /** `toNew`: send to the value typed in; otherwise to the one already on the account. */
  send: (toNew: boolean) => Promise<VerificationStatus>;
  confirm: (code: string) => Promise<UserProfile>;
  /** Shown instead of everything else (a shop's customer profile cannot change these). */
  blocked?: string | null;
}

/**
 * Add, confirm or change an email or a mobile number (S3, S4): see what is on the
 * account, type a new one or confirm the current one, then enter the code sent to it.
 * Nothing changes on the account until the code comes back.
 */
export function VerifyFlow({
  title,
  current,
  verified,
  strings,
  renderInput,
  inputReady,
  send,
  confirm,
  blocked,
}: VerifyFlowProps) {
  const router = useRouter();
  const toast = useToast();
  const { updateProfile } = useSession();
  const codeRef = useRef<CodeInputHandle>(null);
  const [step, setStep] = useState<Step>(current ? "view" : "enter");
  const [usingNew, setUsingNew] = useState(!current);
  const [destination, setDestination] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const countdown = useCountdown(0);
  const sending = useSubmit();
  const confirming = useSubmit();

  const sendCode = (toNew: boolean) =>
    void sending.run(async () => {
      setError(null);
      setInputError(null);
      try {
        const status = await send(toNew);
        setUsingNew(toNew);
        setDestination(status.destination);
        countdown.restart(status.cooldownSeconds);
        setCode("");
        setStep("code");
      } catch (err) {
        const message = authErrorMessage(err);
        if (step === "enter") setInputError(message);
        else setError(message);
      }
    });

  const submitCode = (entered: string) => {
    if (entered.length !== 6) return;
    void confirming.run(async () => {
      setError(null);
      try {
        await updateProfile(await confirm(entered));
        toast.show(t(strings.confirmed), "success");
        if (router.canGoBack()) router.back();
        else router.replace("/account");
      } catch (err) {
        setError(messageFor(err));
        setCode("");
        codeRef.current?.shake();
      }
    });
  };

  if (blocked) {
    return (
      <FormScreen title={title} backFallback="/account">
        <Banner tone="info" message={blocked} />
      </FormScreen>
    );
  }

  if (step === "code") {
    return (
      <FormScreen
        title={title}
        lead={t(strings.sentTo, { destination })}
        backFallback="/account"
        footer={
          <Button label={t(strings.confirm)} onPress={() => submitCode(code)} disabled={code.length !== 6} loading={confirming.busy} />
        }
      >
        <CodeInput
          ref={codeRef}
          label={t("fields.code")}
          value={code}
          onChange={(next) => {
            setCode(next);
            setError(null);
          }}
          onComplete={submitCode}
          error={error}
          editable={!confirming.busy}
          testID="verify-code"
        />
        <View>
          {countdown.done ? (
            <Button variant="ghost" block={false} label={t(strings.resend)} onPress={() => sendCode(usingNew)} loading={sending.busy} />
          ) : (
            <Text variant="small" tone="mute" accessibilityLiveRegion="polite">
              {t("auth.code.resendIn", { time: formatCountdown(countdown.left) })}
            </Text>
          )}
          <Button
            variant="ghost"
            block={false}
            label={t(strings.different)}
            onPress={() => {
              setError(null);
              setStep("enter");
            }}
          />
        </View>
      </FormScreen>
    );
  }

  if (step === "enter") {
    return (
      <FormScreen
        title={title}
        lead={t(strings.leadAdd)}
        backFallback="/account"
        footer={<Button label={t(strings.send)} onPress={() => sendCode(true)} disabled={!inputReady} loading={sending.busy} />}
      >
        {renderInput({ error: inputError, submit: () => inputReady && sendCode(true), clearError: () => setInputError(null) })}
        {current ? (
          <Button variant="ghost" block={false} label={t("common.cancel")} onPress={() => setStep("view")} />
        ) : null}
      </FormScreen>
    );
  }

  return (
    <FormScreen
      title={title}
      lead={t(verified ? strings.leadVerified : strings.leadConfirm)}
      backFallback="/account"
      footer={
        verified ? (
          <Button variant="secondary" label={t(strings.change)} onPress={() => setStep("enter")} />
        ) : (
          <View style={{ gap: 8 }}>
            <Button label={t(strings.send)} onPress={() => sendCode(false)} loading={sending.busy} />
            <Button variant="ghost" label={t(strings.different)} onPress={() => setStep("enter")} />
          </View>
        )
      }
    >
      <ListGroup>
        <ListRow
          title={t(strings.current)}
          value={current ?? ""}
          detail={verified ? t("account.verified") : t("account.notVerified")}
        />
      </ListGroup>
      {error ? <Banner tone="danger" message={error} /> : null}
    </FormScreen>
  );
}
