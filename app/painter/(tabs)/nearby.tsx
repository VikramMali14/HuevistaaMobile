import Feather from "@expo/vector-icons/Feather";
import { useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { messageFor } from "@/api/errors";
import { painterApi, type PainterProfile } from "@/api/endpoints/painter";
import { keys } from "@/api/query-keys";
import { useSession } from "@/auth/session";
import { Banner, Button, Card, ErrorState, Screen, Skeleton, Switch, Text, TextField, useToast } from "@/components/ui";
import { PainterCardBody } from "@/features/nearby/NearbyCards";
import { ABOUT_MAX, hasSavedLocation, listingBody, listingNeeds, ROUGH_FIX_METRES, type PendingLocation } from "@/features/painter/listing";
import { PainterHeader } from "@/features/painter/PainterHeader";
import { isNoProfile, usePainterProfile } from "@/features/painter/use-painter";
import { t } from "@/i18n";
import { formatServerDate } from "@/lib/dates";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/**
 * P5 · Nearby — be found by customers. Spec: docs/05-screens-painter.md — P5. Web
 * reference: HueVistaaPainter app/(app)/(painter)/listing/listing-screen.tsx.
 *
 * Whether customers nearby see this painter, where they're based (kept to about a kilometre
 * — rounded on the phone before it is sent, and again by the server), a line about them,
 * and the row a customer would see. Listing needs a base and a confirmed mobile; what's
 * missing is said, with the way to it. Location is asked for only when "Use where I am now"
 * is pressed, with why on the screen above it.
 */
export default function PainterNearby() {
  const { space } = useTheme();
  const router = useRouter();
  const painter = usePainterProfile();
  const pull = usePullToRefresh(() => painter.refetch());
  const p = painter.data;

  if (p) {
    // A saved change starts the form afresh from what the server kept.
    return <ListingForm key={`${p.listedForCustomers}|${p.about ?? ""}|${p.latitude}|${p.longitude}|${p.locationUpdatedAt ?? ""}`} profile={p} onRefresh={() => painter.refetch()} />;
  }
  let body;
  if (painter.isPending) {
    body = (
      <View style={{ gap: space.sm }} testID="nearby-loading">
        <Skeleton height={80} radius={16} />
        <Skeleton height={140} radius={16} />
      </View>
    );
  } else {
    body = isNoProfile(painter.error) ? (
      <Banner tone="info" message={t("painter.profile.missingTitle")}>
        <Button variant="ghost" block={false} label={t("painter.profile.setUp")} onPress={() => router.push("/painter/profile")} />
      </Banner>
    ) : (
      <ErrorState error={painter.error} onRetry={() => void painter.refetch()} />
    );
  }

  return (
    <Screen scroll edges={["top"]} onRefresh={pull.onRefresh} refreshing={pull.refreshing} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <PainterHeader eyebrow={t("painter.nearby.eyebrow")} title={t("painter.nearby.title")} />
      <Text variant="painterBody" tone="soft">
        {t("painter.nearby.lead")}
      </Text>
      {body}
    </Screen>
  );
}

function ListingForm({ profile, onRefresh }: { profile: PainterProfile; onRefresh: () => Promise<unknown> }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { space } = useTheme();
  const pull = usePullToRefresh(onRefresh);
  const { profile: account } = useSession();
  const [listed, setListed] = useState(Boolean(profile.listedForCustomers));
  const [about, setAbout] = useState(profile.about ?? "");
  const [pending, setPending] = useState<PendingLocation>(null);
  const [locError, setLocError] = useState<{ message: string; settings: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locating = useSubmit();
  const saving = useSubmit();

  const needs = listingNeeds(profile, pending);
  const dirty = listed !== Boolean(profile.listedForCustomers) || about.trim() !== (profile.about ?? "") || pending !== null;
  const rough = pending && pending !== "clear" && Number.isFinite(pending.accuracy) && pending.accuracy > ROUGH_FIX_METRES ? pending.accuracy : null;

  const locate = () =>
    void locating.run(async () => {
      setLocError(null);
      setError(null);
      try {
        const asked = await Location.requestForegroundPermissionsAsync();
        if (!asked.granted) {
          setLocError({ message: t("painter.nearby.locationDenied"), settings: !asked.canAskAgain });
          return;
        }
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setPending({ latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy ?? NaN });
      } catch {
        setLocError({ message: t("painter.nearby.locationFailed"), settings: false });
      }
    });

  const save = () =>
    void saving.run(async () => {
      setError(null);
      try {
        const updated = await painterApi.updateListing(listingBody(listed, about, pending));
        queryClient.setQueryData(keys.painterProfile, updated);
        toast.show(updated.listedForCustomers ? t("painter.nearby.savedListed") : t("painter.nearby.savedHidden"), "success");
      } catch (err) {
        setError(messageFor(err, t("painter.nearby.failed")));
      }
    });

  let status: string;
  if (pending === "clear") status = t("painter.nearby.pendingClear");
  else if (pending) status = t("painter.nearby.pendingNew");
  else if (hasSavedLocation(profile)) status = profile.locationUpdatedAt ? t("painter.nearby.setOn", { date: formatServerDate(profile.locationUpdatedAt) }) : t("painter.nearby.setPlain");
  else status = t("painter.nearby.none");

  const name = (account?.namePending ? null : account?.name?.trim()) || profile.name?.trim() || t("painter.nearby.painter");

  return (
    <Screen
      scroll
      edges={["top"]}
      onRefresh={pull.onRefresh}
      refreshing={pull.refreshing}
      contentStyle={{ gap: space.lg, paddingBottom: space.xl }}
      footer={
        <View style={{ gap: space.xs }}>
          {error ? <Banner tone="danger" message={error} testID="nearby-error" /> : null}
          <Button label={t("painter.nearby.save")} onPress={save} loading={saving.busy} disabled={!dirty || locating.busy} testID="nearby-save" />
        </View>
      }
    >
      <PainterHeader eyebrow={t("painter.nearby.eyebrow")} title={t("painter.nearby.title")} />
      <Text variant="painterBody" tone="soft">
        {t("painter.nearby.lead")}
      </Text>
      <Card lit={listed}>
        <View style={{ gap: space.sm }}>
          <Switch
            label={t("painter.nearby.show")}
            note={listed ? t("painter.nearby.shown") : t("painter.nearby.hidden")}
            value={listed}
            onValueChange={(next) => {
              setError(null);
              setListed(next);
            }}
            // Turning it off is always allowed; on needs a base and a confirmed mobile.
            disabled={!listed && !needs.ready}
            testID="nearby-switch"
          />
          {!needs.ready ? (
            <View style={{ gap: space.xs }} testID="nearby-needs">
              <Need done={needs.location} label={needs.location ? t("painter.nearby.locationSet") : t("painter.nearby.needLocation")} />
              <Need
                done={needs.mobile}
                label={needs.mobile ? t("painter.nearby.mobileSet") : t("painter.nearby.needMobile")}
                onPress={needs.mobile ? undefined : () => router.push("/mobile-number")}
              />
            </View>
          ) : null}
        </View>
      </Card>

      <View style={{ gap: space.sm }}>
        <Text variant="title3" accessibilityRole="header">
          {t("painter.nearby.where")}
        </Text>
        <Text variant="painterBody" testID="nearby-location-status">
          {status}
        </Text>
        <Text variant="small" tone="soft">
          {t("painter.nearby.kept")}
        </Text>
        {rough ? <Banner tone="warning" message={t("painter.nearby.rough", { km: Math.max(1, Math.round(rough / 1000)) })} /> : null}
        {locError ? (
          <Banner tone="danger" message={locError.message} testID="nearby-location-error">
            {locError.settings ? <Button variant="ghost" block={false} label={t("painter.scan.openSettings")} onPress={() => void Linking.openSettings()} /> : null}
          </Banner>
        ) : null}
        <View style={[styles.row, { gap: space.sm }]}>
          <View style={styles.fill}>
            <Button
              variant="secondary"
              icon="crosshair"
              label={locating.busy ? t("painter.nearby.finding") : needs.location ? t("painter.nearby.updateHere") : t("painter.nearby.useHere")}
              onPress={locate}
              loading={locating.busy}
              disabled={saving.busy}
              testID="nearby-locate"
            />
          </View>
          {needs.location ? (
            <Button
              variant="ghost"
              block={false}
              label={t("painter.nearby.remove")}
              onPress={() => {
                setPending("clear");
                // A painter with no base can't be listed.
                setListed(false);
              }}
              disabled={locating.busy || saving.busy}
              testID="nearby-remove"
            />
          ) : null}
        </View>
      </View>

      <TextField
        label={t("painter.nearby.about")}
        placeholder={t("painter.nearby.aboutPlaceholder")}
        value={about}
        onChangeText={(next) => {
          setError(null);
          setAbout(next.slice(0, ABOUT_MAX));
        }}
        maxLength={ABOUT_MAX}
        multiline
        hint={t("painter.nearby.aboutCount", { n: about.length })}
        testID="nearby-about"
      />

      <View style={{ gap: space.sm }}>
        <View style={styles.row}>
          <Text variant="title3" accessibilityRole="header" style={styles.fill}>
            {t("painter.nearby.preview")}
          </Text>
          <Button variant="ghost" block={false} label={t("painter.nearby.editDetails")} onPress={() => router.push("/painter/profile")} />
        </View>
        <Card>
          <View testID="nearby-preview">
            {/* The row a customer sees in C32, at an example distance; the number shows only to a customer who presses Call. */}
            <PainterCardBody
              painter={{
                id: profile.userId,
                name,
                about: about.trim() || null,
                serviceAreas: profile.serviceAreas ?? [],
                specialties: profile.specialties ?? [],
                yearsExperience: profile.yearsExperience ?? null,
                dayRateInr: profile.dayRateInr ?? null,
                rating: profile.rating ?? null,
                ratingCount: profile.ratingCount ?? 0,
                jobsCompleted: profile.jobsCompleted ?? 0,
                distanceKm: 2.4,
              }}
              actions={<Button icon="phone" label={t("nearby.call")} disabled onPress={() => {}} />}
            />
          </View>
        </Card>
        <Text variant="caption" tone="mute">
          {t("painter.nearby.previewNote")}
        </Text>
      </View>

    </Screen>
  );
}

/** One thing listing still needs, with a way to it when there is one. */
function Need({ done, label, onPress }: { done: boolean; label: string; onPress?: () => void }) {
  const { colors, space } = useTheme();
  return (
    <View style={[styles.row, { gap: space.sm }]}>
      <Feather name={done ? "check-circle" : "alert-circle"} size={18} color={done ? colors.successText : colors.accentText} />
      <Text variant="body" style={styles.fill}>
        {label}
      </Text>
      {onPress ? <Button variant="ghost" block={false} label={t("painter.rewards.addMobile")} onPress={onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  fill: { flex: 1 },
});
