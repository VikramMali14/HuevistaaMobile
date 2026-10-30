import Feather from "@expo/vector-icons/Feather";
import type { ReactNode } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { messageFor } from "@/api/errors";
import type { NearbyPainter, NearbyShop } from "@/api/endpoints/nearby";
import { Button, Card, Pill, RemoteImage, Text } from "@/components/ui";
import { displayPhone } from "@/features/painter/redeem";
import { t } from "@/i18n";
import { useAlive } from "@/lib/use-alive";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

import { directionsHref, distanceLabel, shopHours, shopPlace, telHref, trackRecord, whatsappHref } from "./nearby";
import { usePainterPhone, useWorkAreas } from "./use-nearby";
import { workAreasText } from "./work-areas";

/** Opens a link the phone may have nothing for (tel: on a tablet): nothing happens then. */
function open(url: string | null) {
  if (url) void Linking.openURL(url).catch(() => {});
}

/**
 * One painter as a customer sees them (C32) — and as the painter sees their own listing
 * (P5's preview, with `actions` standing in for the call). Ported from the website's
 * PainterCard: the painter's card — photo, name and address — where they can go for a job,
 * with the distance, the badge and what they've done. Nothing else a painter fills in is shown
 * to customers. The places are named by the catalogue (useWorkAreas); until it has loaded, or
 * if it can't, the card simply goes without that line.
 */
export function PainterCardBody({ painter: p, actions }: { painter: NearbyPainter; actions?: ReactNode }) {
  const { space, colors } = useTheme();
  const name = p.name?.trim() || t("nearby.painter");
  const catalogue = useWorkAreas();
  const areas = workAreasText(p.workAreas, catalogue.data);
  return (
    <View style={{ gap: space.sm }}>
      <View style={[styles.painterHead, { gap: space.sm }]}>
        {p.photoUrl ? (
          <RemoteImage url={p.photoUrl} style={styles.photo} accessibilityLabel={t("nearby.photoOf", { name })} />
        ) : null}
        <View style={[styles.fill, { gap: 2 }]}>
          <Text variant="title3" accessibilityRole="header">
            {name}
          </Text>
          {p.address?.trim() ? (
            <Text variant="small" tone="mute" testID={`painter-address-${p.id}`}>
              {p.address.trim()}
            </Text>
          ) : null}
        </View>
        <Text variant="small" tone="accent">
          {distanceLabel(p.distanceKm, true)}
        </Text>
      </View>
      {areas ? (
        <View style={[styles.areas, { gap: space.xs }]}>
          <Feather name="map" size={16} color={colors.accentText} style={styles.areasIcon} />
          <Text variant="small" style={styles.fill} testID={`painter-areas-${p.id}`}>
            {areas}
          </Text>
        </View>
      ) : null}
      {p.certified !== false || p.worksInYourArea ? (
        <View style={[styles.row, styles.wrap, { gap: space.xs }]}>
          {p.certified !== false ? <Pill label={t("nearby.certified")} tone="accent" testID="painter-certified" /> : null}
          {/* Found because they work where the customer is, maybe from far off: said, so the distance makes sense. */}
          {p.worksInYourArea ? <Pill label={t("nearby.worksHere")} tone="success" testID={`painter-works-here-${p.id}`} /> : null}
        </View>
      ) : null}
      <Text variant="small" tone="soft">
        {trackRecord(p)}
      </Text>
      {actions}
    </View>
  );
}

/**
 * A painter in the search, with the one way to reach them: **Call** asks for their number
 * (it isn't in the search, so the list can't be walked for numbers) and dials it at once;
 * from then on the number shows, with WhatsApp when it can be placed.
 */
export function PainterCard({ painter }: { painter: NearbyPainter }) {
  const { space } = useTheme();
  const contact = usePainterPhone(painter.id);
  const phone = contact.data?.phone ?? null;
  const calling = useSubmit();
  const alive = useAlive();

  // One press, one call: a second tap while the number comes is dropped, and a number that
  // comes after the card has gone dials nothing.
  const call = () =>
    void calling.run(async () => {
      if (phone) return open(telHref(phone));
      const asked = await contact.refetch();
      if (asked.data && alive.current) open(telHref(asked.data.phone));
    });

  const wa = whatsappHref(phone);
  const actions = (
    <View style={{ gap: space.xs }}>
      {/* On a line of its own: inside the button, beside WhatsApp, a phone's width cuts it off. */}
      {phone ? (
        <Text variant="bodyStrong" selectable testID={`phone-${painter.id}`}>
          {displayPhone(phone)}
        </Text>
      ) : null}
      <View style={[styles.row, { gap: space.xs }]}>
        <View style={styles.fill}>
          <Button
            icon="phone"
            label={contact.isFetching ? t("nearby.gettingNumber") : t("nearby.call")}
            accessibilityHint={phone ? t("nearby.callNumber", { phone: displayPhone(phone) }) : t("nearby.callHint")}
            onPress={call}
            loading={contact.isFetching}
            testID={`call-${painter.id}`}
          />
        </View>
        {wa ? <Button variant="secondary" block={false} label={t("nearby.whatsapp")} onPress={() => open(wa)} testID={`whatsapp-${painter.id}`} /> : null}
      </View>
      {contact.isError && !phone ? (
        <Text variant="small" tone="danger" accessibilityLiveRegion="polite" testID={`call-error-${painter.id}`}>
          {messageFor(contact.error, t("nearby.numberFailed"))}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Card>
      <PainterCardBody painter={painter} actions={actions} />
    </Card>
  );
}

/** A shop: name and distance, where, when it's open — Directions, and Call when dialable. */
export function ShopCard({ shop: s }: { shop: NearbyShop }) {
  const { space } = useTheme();
  const place = shopPlace(s);
  const hours = shopHours(s.openingHours);
  const tel = telHref(s.phone);
  return (
    <Card>
      <View style={{ gap: space.sm }}>
        <View style={styles.head}>
          <Text variant="title3" accessibilityRole="header" style={styles.fill}>
            {s.name}
          </Text>
          <Text variant="small" tone="accent">
            {distanceLabel(s.distanceKm)}
          </Text>
        </View>
        {place ? <Text variant="body">{place}</Text> : null}
        {hours ? (
          <Text variant="small" tone="mute">
            {hours}
          </Text>
        ) : null}
        <View style={[styles.row, { gap: space.xs }]}>
          <View style={styles.fill}>
            <Button icon="navigation" label={t("nearby.directions")} onPress={() => open(directionsHref(s.latitude, s.longitude))} testID={`directions-${s.id}`} />
          </View>
          {tel ? <Button variant="secondary" block={false} icon="phone" label={t("nearby.call")} accessibilityHint={s.phone ?? undefined} onPress={() => open(tel)} testID={`shop-call-${s.id}`} /> : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  painterHead: { flexDirection: "row", alignItems: "center" },
  photo: { width: 56, height: 56, borderRadius: 28 },
  row: { flexDirection: "row", alignItems: "center" },
  wrap: { flexWrap: "wrap" },
  areas: { flexDirection: "row", alignItems: "flex-start" },
  areasIcon: { marginTop: 2 },
  fill: { flex: 1 },
});
