import { useRouter } from "expo-router";
import { useState } from "react";

import { Button, TextField } from "@/components/ui";
import { FormScreen } from "@/components/FormScreen";
import { rewardTokenFrom } from "@/features/painter/reward-token";
import { t } from "@/i18n";

/**
 * P8 · Type the code. Spec: docs/05-screens-painter.md — P8. Web reference: the typed path
 * of HueVistaaPainter app/(app)/(painter)/scan/scan-screen.tsx.
 *
 * For a board too creased or too dark to scan: one field that takes the code or the whole
 * link (pasted as it is), checked the way the camera checks a read, then P6.
 */
export default function TypeCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const check = () => {
    if (!code.trim()) {
      setError(t("painter.typeCode.empty"));
      return;
    }
    const token = rewardTokenFrom(code);
    if (!token) {
      setError(t("painter.typeCode.notOurs"));
      return;
    }
    // In its place: back from the board goes to where the code was asked for from.
    router.replace({ pathname: "/painter/claim/[token]", params: { token } });
  };

  return (
    <FormScreen
      title={t("painter.typeCode.title")}
      lead={t("painter.typeCode.lead")}
      backFallback="/painter/scan"
      footer={<Button label={t("painter.typeCode.check")} onPress={check} testID="type-code-check" />}
    >
      <TextField
        label={t("painter.typeCode.label")}
        value={code}
        onChangeText={(next) => {
          setCode(next);
          setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={check}
        autoFocus
        error={error}
        testID="type-code-field"
      />
    </FormScreen>
  );
}
