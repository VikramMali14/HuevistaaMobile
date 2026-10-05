import { useRouter } from "expo-router";
import { useState } from "react";

import { authApi } from "@/api/endpoints/auth";
import { fieldErrorOr } from "@/api/errors";
import { useSession } from "@/auth/session";
import { FormScreen } from "@/components/FormScreen";
import { Banner, Button, TextField, useToast } from "@/components/ui";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { NAME_MAX, validateName } from "@/lib/validation";

/**
 * S2 · Your name. Spec: docs/06-screens-shared.md — S2.
 *
 * One field and Save — `PATCH /api/auth/profile { name }`.
 */
export default function EditName() {
  const router = useRouter();
  const toast = useToast();
  const { profile, updateProfile } = useSession();
  const [name, setName] = useState(profile && !profile.namePending ? profile.name : "");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const { busy, run } = useSubmit();

  const key = validateName(name);
  const unchanged = Boolean(profile && !profile.namePending && name.trim() === profile.name);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/account");
  };

  const save = () => {
    setTried(true);
    if (key) return;
    if (unchanged) {
      leave();
      return;
    }
    void run(async () => {
      setError(null);
      setFieldErr(null);
      try {
        await updateProfile(await authApi.updateProfile({ name: name.trim() }));
        toast.show(t("editName.saved"), "success");
        leave();
      } catch (err) {
        const { field, message } = fieldErrorOr(err, "name");
        if (field) setFieldErr(field);
        else setError(message);
      }
    });
  };

  return (
    <FormScreen
      title={t("editName.title")}
      lead={t("editName.lead")}
      backFallback="/account"
      footer={<Button label={t("common.save")} onPress={save} loading={busy} />}
    >
      <TextField
        label={t("fields.name")}
        value={name}
        onChangeText={(next) => {
          setName(next);
          setFieldErr(null);
          setError(null);
        }}
        error={fieldErr ?? (tried && key ? t(key) : null)}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={NAME_MAX}
        returnKeyType="done"
        onSubmitEditing={save}
        autoFocus
      />
      {error ? <Banner tone="danger" message={error} /> : null}
    </FormScreen>
  );
}
