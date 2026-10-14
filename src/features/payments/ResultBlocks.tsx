import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { BalanceChip, Banner, Button, Screen, Text } from "@/components/ui";
import { useBalance } from "@/features/account/use-balance";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

import { roomsAndCredits } from "./basket-words";

/**
 * C29's blocks, shared by the Razorpay result and the Google Play one, so both say the
 * same thing in the same words (and tests find them by the same testIDs). Only what is
 * shown lives here; what the server said, and what Check again does, is the screen's.
 */

/** Asking the server — or, with `nothing`, there's no payment to show here. */
export function WaitingResult({ nothing, onHome }: { nothing: boolean; onHome: () => void }) {
  const { colors, space } = useTheme();
  return (
    <Screen>
      <View style={[styles.fill, styles.center, { gap: space.md }]} accessibilityLiveRegion="polite" testID="payment-verifying">
        {nothing ? null : <ActivityIndicator color={colors.accentText} />}
        <Text variant="body" tone="soft">
          {nothing ? t("payment.nothing") : t("payment.verifying")}
        </Text>
        {nothing ? <Button variant="secondary" block={false} label={t("common.goHome")} onPress={onHome} /> : null}
      </View>
    </Screen>
  );
}

/** Confirmed: what was added, the new balance and the next step. */
export function PaidResult({
  rooms,
  credits,
  forImage,
  reference,
  onHome,
}: {
  rooms: number;
  credits: number;
  /** Bought from C23's Buy: back to the image being chosen. */
  forImage: boolean;
  /** The payment's reference, when the server gave one. */
  reference?: string | null;
  onHome: () => void;
}) {
  const router = useRouter();
  const { colors, space } = useTheme();
  const balance = useBalance();
  const what = roomsAndCredits(rooms, credits);

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          {forImage && credits > 0 ? (
            <Button
              label={t("payment.backToImage")}
              icon="image"
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/ai-image/new"))}
              testID="payment-back-to-image"
            />
          ) : rooms > 0 ? (
            <Button label={t("payment.startRoom")} icon="camera" onPress={() => router.replace("/room/new")} testID="payment-start" />
          ) : (
            <Button label={t("payment.toBalance")} onPress={() => router.replace("/balance")} />
          )}
          <Button variant="ghost" label={t("common.goHome")} onPress={onHome} />
        </View>
      }
    >
      <View style={[styles.fill, { justifyContent: "center", gap: space.lg }]} testID="payment-paid" accessibilityLiveRegion="polite">
        <Feather name="check-circle" size={40} color={colors.accentText} />
        <View style={{ gap: space.xs }}>
          <Text variant="display" accessibilityRole="header">
            {t("payment.paid")}
          </Text>
          <Text variant="lead">{what ? t("payment.added", { what }) : t("payment.paidPlain")}</Text>
        </View>
        {balance.loaded ? (
          <View style={[styles.row, { gap: space.xs }]}>
            <BalanceChip
              icon="home"
              label={balance.rooms === 0 ? t("balance.noRooms") : balance.rooms === 1 ? t("balance.oneRoom") : t("balance.rooms", { n: balance.rooms })}
            />
            {balance.credits !== null ? (
              <BalanceChip icon="image" label={balance.credits === 1 ? t("balance.oneCredit") : t("balance.credits", { n: balance.credits })} />
            ) : null}
          </View>
        ) : null}
        {reference ? (
          <Text variant="small" tone="mute" selectable>
            {t("payment.reference", { id: reference })}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

/** Paid, not yet confirmed: tried again by itself and on Check again — never "failed", never a Pay button. */
export function CheckingResult({
  reference,
  busy,
  onCheck,
  onHome,
}: {
  reference?: string | null;
  busy: boolean;
  onCheck: () => void;
  onHome: () => void;
}) {
  const { colors, space } = useTheme();
  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          <Button label={t("payment.checkAgain")} loading={busy} onPress={onCheck} testID="payment-check" />
          <Button variant="ghost" label={t("common.goHome")} onPress={onHome} />
        </View>
      }
    >
      <View style={[styles.fill, { justifyContent: "center", gap: space.md }]} testID="payment-checking" accessibilityLiveRegion="polite">
        <Feather name="clock" size={40} color={colors.accentText} />
        <Text variant="title1" accessibilityRole="header">
          {t("payment.checkingTitle")}
        </Text>
        <Text variant="body" tone="soft">
          {t("payment.checkingBody")}
        </Text>
        {reference ? (
          <Text variant="small" tone="mute" selectable>
            {t("payment.reference", { id: reference })}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

/** Refused by our server (it checked and said no): its reason, the reference and Get help. */
export function RefusedResult({
  message,
  reference,
  onHelp,
  onHome,
}: {
  message: string;
  reference?: string | null;
  onHelp: () => void;
  onHome: () => void;
}) {
  const { space } = useTheme();
  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          <Button label={t("common.getHelp")} icon="help-circle" onPress={onHelp} />
          <Button variant="ghost" label={t("common.goHome")} onPress={onHome} />
        </View>
      }
    >
      <View style={[styles.fill, { justifyContent: "center", gap: space.md }]} testID="payment-refused">
        <Text variant="title1" accessibilityRole="header">
          {t("payment.refusedTitle")}
        </Text>
        <Banner tone="danger" message={message} />
        <Text variant="body" tone="soft">
          {t("payment.refusedBody")}
        </Text>
        {reference ? (
          <Text variant="small" tone="mute" selectable>
            {t("payment.reference", { id: reference })}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

/** Google is still waiting for the money: nothing added yet, and nothing to pay again. */
export function PendingResult({ busy, onCheck, onHome }: { busy: boolean; onCheck: () => void; onHome: () => void }) {
  const { colors, space } = useTheme();
  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          <Button variant="secondary" label={t("payment.checkAgain")} loading={busy} onPress={onCheck} testID="payment-pending-check" />
          <Button variant="ghost" label={t("common.goHome")} onPress={onHome} />
        </View>
      }
    >
      <View style={[styles.fill, { justifyContent: "center", gap: space.md }]} testID="payment-pending" accessibilityLiveRegion="polite">
        <Feather name="clock" size={40} color={colors.accentText} />
        <Text variant="title1" accessibilityRole="header">
          {t("payment.pendingTitle")}
        </Text>
        <Text variant="body" tone="soft">
          {t("payment.pendingBody")}
        </Text>
      </View>
    </Screen>
  );
}

/** The purchase belongs to another HueVistaa account: nothing added here, and nothing to do. */
export function OtherAccountResult({ onHome }: { onHome: () => void }) {
  const { colors, space } = useTheme();
  return (
    <Screen footer={<Button variant="secondary" label={t("common.goHome")} onPress={onHome} />}>
      <View style={[styles.fill, { justifyContent: "center", gap: space.md }]} testID="payment-other-account">
        <Feather name="user-x" size={40} color={colors.accentText} />
        <Text variant="title1" accessibilityRole="header">
          {t("payment.otherAccountTitle")}
        </Text>
        <Text variant="body" tone="soft">
          {t("payment.otherAccountBody")}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", flexWrap: "wrap" },
});
