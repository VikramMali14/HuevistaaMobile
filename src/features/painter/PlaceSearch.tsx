import { useState } from "react";
import { Keyboard, StyleSheet, View } from "react-native";

import { messageFor } from "@/api/errors";
import { nearbyApi, type NearbyPlace } from "@/api/endpoints/nearby";
import { Banner, Button, Chip, Text, TextField } from "@/components/ui";
import { placeLabel } from "@/features/nearby/nearby";
import { t } from "@/i18n";
import { useAlive } from "@/lib/use-alive";
import { useTheme } from "@/theme";

/**
 * A town, an area or a PIN code typed, to take the pin map there (P5). The server finds the place
 * in its own directory (GET /api/nearby/places); the painter taps theirs, its middle becomes the
 * pin, and they move the map from there onto their own street before saving it with everything
 * else. As the painter website's place-search.tsx.
 */
export function PlaceSearch({ disabled, onPick }: { disabled?: boolean; onPick: (place: NearbyPlace, label: string) => void }) {
  const { space } = useTheme();
  const alive = useAlive();
  const [query, setQuery] = useState("");
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<NearbyPlace[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const find = async () => {
    const typed = query.trim();
    Keyboard.dismiss();
    setFound([]);
    if (!typed) {
      setProblem(t("painter.nearby.placeEmpty"));
      return;
    }
    setFinding(true);
    setProblem(null);
    try {
      const places = await nearbyApi.places(typed);
      if (!alive.current) return;
      if (places.length === 0) {
        setProblem(
          /^[\d\s०-९]+$/.test(typed) ? t("painter.nearby.pinNotFound", { pin: typed }) : t("painter.nearby.placeNotFound", { place: typed }),
        );
      } else if (places.length === 1) {
        onPick(places[0]!, placeLabel(places[0]!));
      } else {
        setFound(places);
      }
    } catch (err) {
      if (alive.current) setProblem(messageFor(err, t("painter.nearby.placeFailed")));
    } finally {
      if (alive.current) setFinding(false);
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      <View style={[styles.row, styles.bottom, { gap: space.sm }]}>
        <View style={styles.fill}>
          <TextField
            label={t("painter.nearby.findPlace")}
            placeholder={t("painter.nearby.placePlaceholder")}
            value={query}
            onChangeText={(next) => {
              setQuery(next);
              setProblem(null);
            }}
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="search"
            maxLength={80}
            editable={!disabled}
            onSubmitEditing={() => void find()}
            testID="nearby-place"
          />
        </View>
        <Button
          variant="secondary"
          block={false}
          icon="search"
          label={t("painter.nearby.placeFind")}
          loading={finding}
          disabled={disabled}
          onPress={() => void find()}
          testID="nearby-place-search"
        />
      </View>
      {problem ? <Banner tone="warning" message={problem} testID="nearby-place-problem" /> : null}
      {found.length > 0 ? (
        <View style={{ gap: space.xs }} testID="nearby-place-choices">
          <Text variant="small" tone="mute">
            {t("painter.nearby.placeChoose")}
          </Text>
          <View style={[styles.row, styles.wrap, { gap: space.xs }]}>
            {found.map((place, i) => (
              <View key={`${place.name}|${place.region}|${place.latitude},${place.longitude}`} style={styles.chip}>
                <Chip
                  label={placeLabel(place)}
                  selected={false}
                  onPress={() => {
                    setFound([]);
                    onPick(place, placeLabel(place));
                  }}
                  testID={`nearby-place-${i}`}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  // The Find button level with the box, under the field's label.
  bottom: { alignItems: "flex-end" },
  wrap: { flexWrap: "wrap" },
  fill: { flex: 1 },
  // A long name is cut short inside its chip, never past the screen's edge.
  chip: { maxWidth: "100%" },
});
