import Feather from "@expo/vector-icons/Feather";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { messageFor } from "@/api/errors";
import { nearbyApi } from "@/api/endpoints/nearby";
import { painterApi, type PainterProfile } from "@/api/endpoints/painter";
import { keys } from "@/api/query-keys";
import { useSession } from "@/auth/session";
import { Banner, Button, Card, ErrorState, Screen, Skeleton, Switch, Text, TextField, useToast } from "@/components/ui";
import { PainterCardBody } from "@/features/nearby/NearbyCards";
import { cityLine, isPin, pinDigits } from "@/features/nearby/nearby";
import { useWorkAreas } from "@/features/nearby/use-nearby";
import { openStates } from "@/features/nearby/work-areas";
import { hasSavedLocation, listingBody, listingNeeds, ownPhotoUrl, type PendingLocation } from "@/features/painter/listing";
import { PainterHeader } from "@/features/painter/PainterHeader";
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
 * Whether customers nearby see this painter, where they work, and the card a customer would
 * see: their photo, name and address (set on the painter website) and the town their PIN code is
 * in, nothing else. Listing needs a PIN code and a confirmed mobile; what's missing is said, with
 * the way to it.
 *
 * Where they work is one question: the PIN code. The painter types its six digits, the server
 * looks them up in its own directory (GET /api/nearby/places) and the screen says the town —
 * "Abu Road, Sirohi, Rajasthan" — so a wrong one is plain to see. No map, nothing asks the phone
 * where it is, and there are no divisions to tick: a customer who searches a PIN code within
 * 20 km of the painter's finds them. A pin put on the map before PIN codes still works, and the
 * painter is asked for their PIN code.
 *
 * HueVistaa is open in some states only — Rajasthan at launch. The lookup finds PIN codes in
 * those states alone, so one anywhere else is not found, and the screen says why (the server
 * refuses it too).
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
        key={`${p.listedForCustomers}|${p.latitude}|${p.longitude}|${p.locationUpdatedAt ?? ""}|${p.pincode ?? ""}`}
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
  /** The PIN code as typed: digits only, six at most. */
  const [pinText, setPinText] = useState(profile.pincode ?? "");
  const [pending, setPending] = useState<PendingLocation>(null);
  /** Why a PIN code typed can't be used: not found, or the lookup failed. */
  const [pinProblem, setPinProblem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = useSubmit();
  const catalogue = useWorkAreas();
  /** The states HueVistaa is open in, for a sentence; null before they load, or across all India. */
  const open = catalogue.data ? openStates(catalogue.data) : null;

  // Looked up as soon as the sixth digit is typed: the painter reads their town without pressing
  // anything. The saved PIN code is not asked about again — the profile already names its place.
  const savedPincode = profile.pincode ?? null;
  const typedNew = isPin(pinText) && pinText !== savedPincode;
  useEffect(() => {
    if (!typedNew) return;
    let live = true;
    nearbyApi
      .places(pinText)
      .then((places) => {
        if (!live) return;
        const place = places.find((found) => found.pincode === pinText);
        if (place) setPending({ pincode: pinText, place: cityLine(place) });
        else setPinProblem(open ? t("painter.nearby.pinNotFoundIn", { pin: pinText, states: open }) : t("painter.nearby.pinNotFound", { pin: pinText }));
      })
      .catch((err) => {
        if (live) setPinProblem(messageFor(err, t("painter.nearby.placeFailed")));
      });
    return () => {
      live = false;
    };
    // `open` only words the sentence: the catalogue loading must not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinText, typedNew]);

  const typePin = (text: string) => {
    setError(null);
    setPinProblem(null);
    // A new digit is a new PIN code: the last one found is no longer the one typed.
    setPending(null);
    setPinText(pinDigits(text));
  };

  // Being looked up: a new PIN code typed, with no answer about it yet.
  const finding = typedNew && pending === null && pinProblem === null;
  const needs = listingNeeds(profile, pending);
  const ready = needs.ready;
  const certified = Boolean(profile.certified);
  // The town on the card: the PIN code's being saved, or the saved one's (a pin from before PIN
  // codes says its district and state).
  const shownPlace =
    pending === "clear" ? null : pending ? pending.place : savedPincode ? (profile.locationName ?? profile.locationPlace ?? null) : (profile.locationPlace ?? null);
  const shownPincode = pending === "clear" ? null : pending ? pending.pincode : savedPincode;
  const dirty = listed !== Boolean(profile.listedForCustomers) || pending !== null;

  const save = () =>
    void saving.run(async () => {
      setError(null);
      try {
        const updated = await painterApi.updateListing(listingBody(listed, pending));
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
  else if (pending) status = pending.place;
  else if (pinText.length > 0 && !isPin(pinText)) status = t("painter.nearby.pinShort");
  else if (hasSavedLocation(profile) && savedPincode) status = shownPlace ?? t("nearby.pin", { pin: savedPincode });
  else if (hasSavedLocation(profile)) status = profile.locationName ? t("painter.nearby.near", { place: profile.locationName }) : t("painter.nearby.setPlain");
  else status = t("painter.nearby.none");
  // The date under the place, once it is named.
  const setOn = !pending && hasSavedLocation(profile) && profile.locationUpdatedAt ? t("painter.nearby.setOn", { date: formatServerDate(profile.locationUpdatedAt) }) : null;

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
            // Turning it off is always allowed; on needs a PIN code and a confirmed mobile.
            disabled={!listed && !ready}
            testID="nearby-switch"
          />
          {!ready ? (
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
        <TextField
          label={t("painter.nearby.pinLabel")}
          placeholder={t("painter.nearby.pinPlaceholder")}
          value={pinText}
          onChangeText={typePin}
          keyboardType="number-pad"
          autoComplete="postal-code"
          maxLength={8}
          editable={!saving.busy}
          testID="nearby-pincode"
        />
        {pinProblem ? (
          <Banner tone="warning" message={pinProblem} testID="nearby-pin-problem" />
        ) : (
          <Text variant="painterBody" accessibilityLiveRegion="polite" testID="nearby-location-status">
            {finding ? t("painter.nearby.pinFinding") : status}
          </Text>
        )}
        {pending && pending !== "clear" ? (
          <Text variant="small" tone="soft" testID="nearby-pending-save">
            {t("painter.nearby.pendingPlace")}
          </Text>
        ) : null}
        {setOn ? (
          <Text variant="small" tone="mute">
            {setOn}
          </Text>
        ) : null}
        {!pending && hasSavedLocation(profile) && !savedPincode ? (
          <Text variant="small" tone="soft" testID="nearby-add-pin">
            {t("painter.nearby.addPin")}
          </Text>
        ) : null}
        <Text variant="small" tone="soft">
          {t("painter.nearby.pinHelp")}
        </Text>
        {open ? (
          <Text variant="small" tone="soft" testID="nearby-only-in">
            {t("painter.nearby.onlyIn", { states: open })}
          </Text>
        ) : null}
        {pending && pending !== "clear" ? (
          // India Post's directory is published under the Government Open Data License and
          // GeoNames under CC BY 4.0; both ask to be credited where their data is used.
          <Text variant="caption" tone="mute" testID="nearby-place-credit">
            {t("painter.nearby.placeCredit")}
          </Text>
        ) : null}
        {needs.location ? (
          <View style={styles.row}>
            <Button
              variant="ghost"
              block={false}
              label={t("painter.nearby.remove")}
              onPress={() => {
                setPinText("");
                setPinProblem(null);
                setPending("clear");
                // A painter with no PIN code can't be listed.
                setListed(false);
              }}
              disabled={saving.busy}
              testID="nearby-remove"
            />
          </View>
        ) : null}
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
                // The town of the PIN code being saved — or the saved one's.
                place: shownPlace,
                pincode: shownPincode,
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
