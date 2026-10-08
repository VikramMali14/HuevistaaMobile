import type { ReactNode } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { messageFor } from "@/api/errors";
import type { NearbyPainter, NearbyShop } from "@/api/endpoints/nearby";
import { Button, Card, Pill, Text } from "@/components/ui";
import { displayPhone } from "@/features/painter/redeem";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

import { directionsHref, distanceLabel, painterFacts, shopHours, shopPlace, telHref, trackRecord, whatsappHref } from "./nearby";
import { usePainterPhone } from "./use-nearby";

/** Opens a link the phone may have nothing for (tel: on a tablet): nothing happens then. */
function open(url: string | null) {
  if (url) void Linking.openURL(url).catch(() => {});
}

/**
 * One painter as a customer sees them (C32) — and as the painter sees their own listing
 * (P5's preview, with `actions` standing in for the call). Ported from the website's
 * PainterCard: name and distance, what they've done, about, specialties, where, facts.
 */
export function PainterCardBody({ painter: p, actions }: { painter: NearbyPainter; actions?: ReactNode }) {
  const { space } = useTheme();
  const facts = painterFacts(p);
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.head}>
        <Text variant="title3" accessibilityRole="header" style={styles.fill}>
          {p.name?.trim() || t("nearby.painter")}
        </Text>
        <Text variant="small" tone="accent">
          {distanceLabel(p.distanceKm, true)}
        </Text>
      </View>
      <Text variant="small" tone="soft">
        {trackRecord(p)}
      </Text>
      {p.about?.trim() ? <Text variant="body">{p.about.trim()}</Text> : null}
      {p.specialties.length ? (
        <View style={[styles.wrap, { gap: space.xs }]}>
          {p.specialties.map((s) => (
            <Pill key={s} label={s} />
          ))}
        </View>
      ) : null}
      {p.serviceAreas.length ? (
        <Text variant="small" tone="mute">
          {t("nearby.worksIn", { areas: p.serviceAreas.join(", ") })}
        </Text>
      ) : null}
      {facts ? (
        <Text variant="small" tone="mute">
          {facts}
        </Text>
      ) : null}
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

  const call = async () => {
    if (phone) return open(telHref(phone));
    const asked = await contact.refetch();
    if (asked.data) open(telHref(asked.data.phone));
  };

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
            onPress={() => void call()}
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
  row: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  fill: { flex: 1 },
});
