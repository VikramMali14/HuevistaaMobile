import { useState } from "react";
import { View } from "react-native";

import { messageFor } from "@/api/errors";
import { painterApi } from "@/api/endpoints/painter";
import { useSession } from "@/auth/session";
import { Banner, Button, ConfirmSheet, Text } from "@/components/ui";
import { FormScreen } from "@/components/FormScreen";
import { t } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/**
 * C33 · Work as a painter. Spec: docs/04-screens-customer.md — C33. Web reference:
 * HueVistaaPainter app/(app)/join/join-panel.tsx.
 *
 * What a painter account does, and plainly that the change is for good — confirmed before
 * it is made. The server refuses an account with rooms or a shop's code, and says why in
 * its own words. No new token comes back (the role is read on every request), so the
 * profile is read again; as a painter, the customer's screens hand over to /painter.
 * Pressing again after a lost answer is safe: becoming a painter twice is nothing new.
 */
export default function BecomePainter() {
  const { space } = useTheme();
  const { refreshProfile } = useSession();
  const making = useSubmit();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = () =>
    void making.run(async () => {
      setError(null);
      try {
        await painterApi.becomePainter();
      } catch (err) {
        setError(messageFor(err, t("becomePainter.failed")));
        return;
      }
      setConfirming(false);
      // The guard moves on to /painter once the profile says PAINTER.
      try {
        await refreshProfile();
      } catch (err) {
        setError(messageFor(err, t("becomePainter.failed")));
      }
    });

  return (
    <FormScreen
      title={t("becomePainter.title")}
      lead={t("becomePainter.lead")}
      backFallback="/account"
      footer={
        <Button
          label={t("becomePainter.make")}
          onPress={() => {
            setError(null);
            setConfirming(true);
          }}
          loading={making.busy && !confirming}
          testID="become-painter"
        />
      }
    >
      <View style={{ gap: space.md }}>
        <Banner tone="warning" message={t("becomePainter.forGood")} />
        <Text variant="body" tone="soft">
          {t("becomePainter.separate")}
        </Text>
        {error && !confirming ? <Banner tone="danger" message={error} testID="become-painter-error" /> : null}
      </View>
      <ConfirmSheet
        visible={confirming}
        title={t("becomePainter.confirmTitle")}
        body={t("becomePainter.confirmBody")}
        consequences={[t("becomePainter.consequenceForGood"), t("becomePainter.consequenceRooms")]}
        confirmLabel={t("becomePainter.confirm")}
        destructive
        loading={making.busy}
        error={error}
        onConfirm={make}
        onCancel={() => setConfirming(false)}
      />
    </FormScreen>
  );
}
