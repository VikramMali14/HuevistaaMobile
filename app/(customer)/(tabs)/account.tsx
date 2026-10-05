import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useSession } from "@/auth/session";
import { Avatar, Banner, ConfirmSheet, ListGroup, ListRow, Screen, Text } from "@/components/ui";
import { SwitchToShop } from "@/features/account/SwitchToShop";
import { useBalance } from "@/features/account/use-balance";
import { useProjects } from "@/features/rooms/use-rooms";
import { t } from "@/i18n";
import { appVersion } from "@/lib/app-version";
import { useSubmit } from "@/lib/use-submit";
import { formatMobileForDisplay } from "@/lib/validation";
import { useTheme } from "@/theme";

/**
 * C5 · Account. Spec: docs/04-screens-customer.md — C5.
 *
 * Who is signed in, what they hold, their shop, help, sign-in details and settings.
 * A shop's customer profile signs in through the shop, so its sign-in details are the
 * shop's to change, and it gets "Switch back to your shop" instead.
 */
export default function Account() {
  const router = useRouter();
  const { space } = useTheme();
  const { profile, signOut } = useSession();
  const balance = useBalance();
  const projects = useProjects();
  const leaving = useSubmit();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [switching, setSwitching] = useState(false);

  if (!profile) return null;
  const linked = Boolean(profile.linkedProfile);
  const hasShop = Boolean(balance.entitlement);
  // The backend refuses to make a painter of an account with rooms or a shop code, so
  // the offer only appears once both are known to be empty.
  const canBecomePainter = !linked && balance.nextStep !== null && !hasShop && projects.isSuccess && projects.data.length === 0;

  const balanceValue = balance.loaded
    ? [
        balance.rooms === 1 ? t("balance.oneRoom") : balance.rooms === 0 ? t("balance.noRooms") : t("balance.rooms", { n: balance.rooms }),
        balance.credits !== null ? (balance.credits === 1 ? t("balance.oneCredit") : t("balance.credits", { n: balance.credits })) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;
  const mobile = profile.phoneNumber ? `+91 ${formatMobileForDisplay(profile.phoneNumber)}` : null;
  const { version, build } = appVersion();

  return (
    <Screen scroll edges={["top"]} contentStyle={{ gap: space.xl, paddingBottom: space.xxl }}>
      <Text variant="title1" accessibilityRole="header" style={{ marginTop: space.md }}>
        {t("account.title")}
      </Text>

      <Pressable
        onPress={linked ? undefined : () => router.push("/edit-name")}
        disabled={linked}
        accessibilityRole={linked ? "summary" : "button"}
        accessibilityLabel={[profile.name, mobile, profile.email].filter(Boolean).join(", ")}
        style={styles.header}
      >
        <Avatar name={profile.name} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title3" numberOfLines={1}>
            {profile.name}
          </Text>
          {mobile ? (
            <Text variant="small" tone="mute">
              {mobile} · {profile.phoneVerified ? t("account.verified") : t("account.notVerified")}
            </Text>
          ) : null}
          {profile.email ? (
            <Text variant="small" tone="mute" numberOfLines={1}>
              {profile.email} · {profile.emailVerified ? t("account.verified") : t("account.notVerified")}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <ListGroup>
        <ListRow icon="home" title={t("account.balance")} value={balanceValue} onPress={() => router.push("/balance")} />
      </ListGroup>

      <ListGroup title={t("account.shop")}>
        {!linked ? <ListRow icon="key" title={t("account.addCode")} onPress={() => router.push("/add-shop-code")} /> : null}
        {hasShop ? <ListRow icon="package" title={t("account.myProducts")} onPress={() => router.push("/my-products")} /> : null}
        <ListRow icon="map-pin" title={t("account.nearby")} onPress={() => router.push("/nearby")} />
        {linked ? <ListRow icon="repeat" title={t("account.switchBack")} onPress={() => setSwitching(true)} testID="switch-back" /> : null}
      </ListGroup>

      <ListGroup title={t("account.help")}>
        <ListRow icon="life-buoy" title={t("account.helpSupport")} onPress={() => router.push("/help")} />
        <ListRow icon="message-circle" title={t("account.questions")} onPress={() => router.push("/questions")} />
      </ListGroup>

      {linked ? (
        <Banner tone="info" message={t("account.linkedNote")} />
      ) : (
        <ListGroup title={t("account.signIn")}>
          <ListRow title={t("account.name")} value={profile.name} onPress={() => router.push("/edit-name")} />
          <ListRow
            title={t("account.email")}
            value={profile.email ?? t("account.noEmail")}
            detail={profile.email ? (profile.emailVerified ? t("account.verified") : t("account.notVerified")) : undefined}
            onPress={() => router.push("/verify-email")}
          />
          <ListRow
            title={t("account.mobile")}
            value={mobile ?? t("account.noMobile")}
            detail={mobile ? (profile.phoneVerified ? t("account.verified") : t("account.notVerified")) : undefined}
            onPress={() => router.push("/mobile-number")}
          />
          <ListRow
            title={t("account.password")}
            value={
              profile.provider === "GOOGLE" && !profile.hasPassword
                ? t("account.passwordGoogle")
                : profile.hasPassword
                  ? t("account.passwordSet")
                  : t("account.passwordNone")
            }
            onPress={() => router.push("/password")}
          />
        </ListGroup>
      )}

      <ListGroup title={t("account.more")}>
        {canBecomePainter ? <ListRow icon="tool" title={t("account.painter")} onPress={() => router.push("/become-painter")} /> : null}
        <ListRow icon="settings" title={t("account.settings")} onPress={() => router.push("/settings")} />
        <ListRow icon="log-out" title={t("common.signOut")} tone="danger" onPress={() => setConfirmSignOut(true)} testID="account-sign-out" />
      </ListGroup>

      <Text variant="caption" tone="mute" align="center">
        {t("account.version", { version, build })}
      </Text>

      <ConfirmSheet
        visible={confirmSignOut}
        title={t("account.signOutTitle")}
        body={t("account.signOutBody")}
        confirmLabel={t("common.signOut")}
        loading={leaving.busy}
        onConfirm={() => void leaving.run(() => signOut())}
        onCancel={() => setConfirmSignOut(false)}
      />
      {linked ? <SwitchToShop visible={switching} onClose={() => setSwitching(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
});
