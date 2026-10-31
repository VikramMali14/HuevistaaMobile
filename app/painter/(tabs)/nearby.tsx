import Feather from "@expo/vector-icons/Feather";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { messageFor } from "@/api/errors";
import { painterApi, type PainterProfile } from "@/api/endpoints/painter";
import { keys } from "@/api/query-keys";
import { useSession } from "@/auth/session";
import { Banner, Button, Card, ErrorState, Screen, Skeleton, Switch, Text, useToast } from "@/components/ui";
import { PainterCardBody } from "@/features/nearby/NearbyCards";
import { useWhere, useWorkAreas } from "@/features/nearby/use-nearby";
import { sameAreas } from "@/features/nearby/work-areas";
import { hasSavedLocation, listingBody, listingNeeds, ownPhotoUrl, savedPin, type PendingLocation } from "@/features/painter/listing";
import { PainterHeader } from "@/features/painter/PainterHeader";
import { PinMap } from "@/features/painter/pin-map/PinMap";
import { PLACE_ZOOM, STREET_ZOOM } from "@/features/painter/pin-map/protocol";
import { PlaceSearch } from "@/features/painter/PlaceSearch";
import { WorkAreasPicker } from "@/features/painter/WorkAreasPicker";
import { isNoProfile, usePainterProfile } from "@/features/painter/use-painter";
import { t } from "@/i18n";
import { formatServerDate } from "@/lib/dates";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useSubmit } from "@/lib/use-submit";
import { env, paymentsMode } from "@/config/env";
import { openWebPage } from "@/lib/open-web";
import { useTheme } from "@/theme";

/**
 * P5 · Nearby — be found by customers. Spec: docs/05-screens-painter.md — P5. Web
 * reference: HueVistaaPainter app/(app)/(painter)/listing/listing-screen.tsx.
 *
 * Whether customers nearby see this painter, where they're based, where they can go for a job,
 * and the card a customer would see: their photo, name and address (set on the painter website)
 * and those places, nothing else. Listing needs a base and a confirmed mobile; what's missing is
 * said, with the way to it.
 *
 * Where they're based is a pin on a map (features/painter/pin-map): the painter finds their town
 * or PIN code to take the map there, and drags it — or taps it — until the pin is on their place.
 * Nothing asks the phone where it is, so location can stay off, and the pin stays where they put
 * it until they move it again: the server keeps it for their own map, and searches only from it
 * rounded to about a kilometre. Customers never see it, nor a distance. Once saved, the screen
 * names the place the pin is in, so a wrong one is plain to see.
 *
 * Where they can work: divisions of their own state — the one their location is in, drawn first —
 * other states, or anywhere in India (WorkAreasPicker), named by the server's catalogue. Customers
 * in those places find them, however far off.
 *
 * Only HueVistaa Certified painters are shown to customers. The switch stays the painter's
 * to set before they are — the listing is saved and goes live once they're certified — so
 * certification is a line under it. The year is bought on the painter website; the link to
 * it is offered only where the app may send somebody to the website to pay (paymentsMode
 * "web" — the Play build's anti-steering rule forbids it there).
 */
export default function PainterNearby() {
  const { space } = useTheme();
  const router = useRouter();
  const painter = usePainterProfile();
  const pull = usePullToRefresh(() => painter.refetch());
  const p = painter.data;

  if (p) {
    // A saved change starts the form afresh from what the server kept.
    return (
      <ListingForm
        key={`${p.listedForCustomers}|${p.latitude}|${p.longitude}|${p.locationUpdatedAt ?? ""}|${(p.workAreas ?? []).join(",")}`}
        profile={p}
        onRefresh={() => painter.refetch()}
      />
    );
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
  const [pending, setPending] = useState<PendingLocation>(null);
  const [areas, setAreas] = useState<string[]>(profile.workAreas ?? []);
  const [error, setError] = useState<string | null>(null);
  // A finger on the map: the page holds still under it.
  const [onMap, setOnMap] = useState(false);
  const saving = useSubmit();
  const catalogue = useWorkAreas();
  // Where a location not saved yet is: named before it is saved, and its state first among the places.
  const pendingArea = useWhere(pending && pending !== "clear" ? { lat: pending.latitude, lon: pending.longitude } : null);
  // The one about to be saved once the server has said where it is — the saved one's until then —
  // and none once it is removed.
  const homeState =
    pending === "clear" ? null : pending ? (pendingArea.data?.state ?? profile.locationState ?? null) : (profile.locationState ?? null);

  const needs = listingNeeds(profile, pending);
  const certified = Boolean(profile.certified);
  // Without the catalogue the places can't be drawn or changed, so they are left as they are.
  const areasChanged = Boolean(catalogue.data) && !sameAreas(areas, profile.workAreas ?? [], catalogue.data!);
  const dirty = listed !== Boolean(profile.listedForCustomers) || pending !== null || areasChanged;

  const save = () =>
    void saving.run(async () => {
      setError(null);
      try {
        const updated = await painterApi.updateListing(listingBody(listed, pending, areasChanged ? areas : undefined));
        queryClient.setQueryData(keys.painterProfile, updated);
        toast.show(
          !updated.listedForCustomers
            ? t("painter.nearby.savedHidden")
            : updated.certified
              ? t("painter.nearby.savedListed")
              : t("painter.nearby.savedUncertified"),
          "success",
        );
      } catch (err) {
        setError(messageFor(err, t("painter.nearby.failed")));
      }
    });

  let status: string;
  if (pending === "clear") status = t("painter.nearby.pendingClear");
  else if (pending)
    status = pending.label
      ? t("painter.nearby.pendingPlace", { place: pending.label })
      : pendingArea.data?.name
        ? t("painter.nearby.pendingNear", { place: pendingArea.data.name })
        : t("painter.nearby.pendingNew");
  else if (hasSavedLocation(profile) && profile.locationName) status = t("painter.nearby.near", { place: profile.locationName });
  else if (hasSavedLocation(profile)) status = profile.locationUpdatedAt ? t("painter.nearby.setOn", { date: formatServerDate(profile.locationUpdatedAt) }) : t("painter.nearby.setPlain");
  else status = t("painter.nearby.none");
  // The date under the place, once it is named.
  const setOn = !pending && hasSavedLocation(profile) && profile.locationName && profile.locationUpdatedAt ? t("painter.nearby.setOn", { date: formatServerDate(profile.locationUpdatedAt) }) : null;

  const name = (account?.namePending ? null : account?.name?.trim()) || profile.name?.trim() || t("painter.nearby.painter");

  return (
    <Screen
      scroll
      scrollEnabled={!onMap}
      edges={["top"]}
      onRefresh={pull.onRefresh}
      refreshing={pull.refreshing}
      contentStyle={{ gap: space.lg, paddingBottom: space.xl }}
      footer={
        <View style={{ gap: space.xs }}>
          {error ? <Banner tone="danger" message={error} testID="nearby-error" /> : null}
          <Button label={t("painter.nearby.save")} onPress={save} loading={saving.busy} disabled={!dirty} testID="nearby-save" />
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
            note={listed ? (certified ? t("painter.nearby.shown") : t("painter.nearby.shownUncertified")) : t("painter.nearby.hidden")}
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
          <View testID="nearby-certified">
            <Need
              done={certified}
              label={
                certified
                  ? t("painter.nearby.certifiedUntil", { date: formatServerDate(profile.certifiedUntil) })
                  : t("painter.nearby.needCertified")
              }
              action={t("painter.nearby.getCertified")}
              onPress={certified || paymentsMode() !== "web" ? undefined : () => void openWebPage(`${env.painterOrigin}/certified`)}
            />
          </View>
        </View>
      </Card>

      <View style={{ gap: space.sm }}>
        <Text variant="title3" accessibilityRole="header">
          {t("painter.nearby.where")}
        </Text>
        <Text variant="painterBody" testID="nearby-location-status">
          {status}
        </Text>
        {setOn ? (
          <Text variant="small" tone="mute">
            {setOn}
          </Text>
        ) : null}
        <PlaceSearch
          disabled={saving.busy}
          onPick={(place, label) => {
            setError(null);
            setPending({ latitude: place.latitude, longitude: place.longitude, label });
          }}
        />
        {pending && pending !== "clear" && pending.label ? (
          // India Post's directory is published under the Government Open Data License and
          // GeoNames under CC BY 4.0; both ask to be credited where their data is used.
          <Text variant="caption" tone="mute" testID="nearby-place-credit">
            {t("painter.nearby.placeCredit")}
          </Text>
        ) : null}
        <PinMap
          pin={pending === "clear" ? null : (pending ?? savedPin(profile))}
          zoom={pending && pending !== "clear" && pending.label ? PLACE_ZOOM : STREET_ZOOM}
          disabled={saving.busy}
          onMove={(moved) => {
            setError(null);
            setPending(moved);
          }}
          onTouch={setOnMap}
        />
        <Text variant="small" tone="soft">
          {t("painter.nearby.mapHelp")}
        </Text>
        <Text variant="small" tone="soft">
          {t("painter.nearby.kept")}
        </Text>
        {needs.location ? (
          <View style={styles.row}>
            <Button
              variant="ghost"
              block={false}
              label={t("painter.nearby.remove")}
              onPress={() => {
                setPending("clear");
                // A painter with no base can't be listed.
                setListed(false);
              }}
              disabled={saving.busy}
              testID="nearby-remove"
            />
          </View>
        ) : null}
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="title3" accessibilityRole="header">
          {t("painter.nearby.areasTitle")}
        </Text>
        <Text variant="small" tone="soft">
          {t("painter.nearby.areasLede")}
        </Text>
        {catalogue.data ? (
          <WorkAreasPicker
            catalogue={catalogue.data}
            value={areas}
            homeState={homeState}
            disabled={saving.busy}
            onChange={(next) => {
              setError(null);
              setAreas(next);
            }}
          />
        ) : catalogue.isError ? (
          <ErrorState message={t("painter.nearby.areasLoadFailed")} onRetry={() => void catalogue.refetch()} />
        ) : (
          <Skeleton height={120} radius={16} />
        )}
      </View>

      <View style={{ gap: space.sm }}>
        <View style={styles.row}>
          <Text variant="title3" accessibilityRole="header" style={styles.fill}>
            {t("painter.nearby.preview")}
          </Text>
          <Button variant="ghost" block={false} label={t("painter.nearby.editDetails")} onPress={() => router.push("/painter/profile")} />
        </View>
        <Card>
          <View testID="nearby-preview">
            {/* The card a customer sees in C32; the number shows only to a customer who presses Call. */}
            <PainterCardBody
              painter={{
                id: profile.userId,
                name,
                photoUrl: ownPhotoUrl(profile.photoVersion),
                address: profile.address ?? null,
                rating: profile.rating ?? null,
                ratingCount: profile.ratingCount ?? 0,
                jobsCompleted: profile.jobsCompleted ?? 0,
                certified: true,
                // Not shown on the card; the place is.
                distanceKm: 0,
                // Where the location being saved is, once the server has said — or the saved one's.
                place: pending === "clear" ? null : pending ? (pendingArea.data?.place ?? null) : (profile.locationPlace ?? null),
                // As ticked above, before it is saved: what the card will say.
                workAreas: catalogue.data ? areas : (profile.workAreas ?? []),
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
function Need({ done, label, action, onPress }: { done: boolean; label: string; action?: string; onPress?: () => void }) {
  const { colors, space } = useTheme();
  return (
    <View style={[styles.row, { gap: space.sm }]}>
      <Feather name={done ? "check-circle" : "alert-circle"} size={18} color={done ? colors.successText : colors.accentText} />
      <Text variant="body" style={styles.fill}>
        {label}
      </Text>
      {onPress ? <Button variant="ghost" block={false} label={action ?? t("painter.rewards.addMobile")} onPress={onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  fill: { flex: 1 },
});
