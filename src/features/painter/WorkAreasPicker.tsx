import { StyleSheet, View } from "react-native";

import type { WorkAreaState, WorkAreas } from "@/api/endpoints/nearby";
import { Chip, Text } from "@/components/ui";
import { divisionTowns, hasDivision, normalise, placeName, toggleDivision, toggleState } from "@/features/nearby/work-areas";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * Where the painter can go for a job (P5): the divisions of the states HueVistaa is open in —
 * Rajasthan at launch — or the whole of one; the same divisions a customer's search chooses
 * between. As the painter website's work-areas-picker.tsx.
 *
 * Each state is one block: "All of Rajasthan", then a chip for each of its divisions, and under
 * them the big towns in each, so a painter from Bhilwara knows to tick Ajmer. Every division in
 * sight at once — there are a handful — and the state the painter's location is in first, should
 * there be more than one. Anywhere in India is no longer offered: the catalogue the server serves
 * is the open states alone.
 */
export function WorkAreasPicker({
  catalogue,
  value,
  onChange,
  homeState = null,
  disabled = false,
}: {
  catalogue: WorkAreas;
  /** As the server keeps it — see features/nearby/work-areas.ts. */
  value: string[];
  onChange: (next: string[]) => void;
  /** The code of the state the painter's location is in, drawn first; null when it isn't known. */
  homeState?: string | null;
  disabled?: boolean;
}) {
  const { space } = useTheme();
  // Read as the server keeps it: anywhere in India, kept from before, is every state here, and a
  // place outside them is not one to tick.
  const chosen = normalise(value, catalogue);
  const home = catalogue.states.find((s) => s.code === homeState) ?? null;
  const states = home ? [home, ...catalogue.states.filter((s) => s !== home)] : catalogue.states;

  return (
    <View style={{ gap: space.lg }} testID="nearby-areas">
      <Text variant="small" tone="soft">
        {t("painter.nearby.areasHint")}
      </Text>
      {states.map((state) => (
        <StateBlock
          key={state.code}
          state={state}
          value={chosen}
          locked={disabled}
          onToggleAll={() => onChange(toggleState(chosen, state, catalogue))}
          onToggle={(code) => onChange(toggleDivision(chosen, state, code, catalogue))}
        />
      ))}
    </View>
  );
}

/** A state: "All of …", then each division — and under them the big towns in each. */
function StateBlock({
  state,
  value,
  locked,
  onToggleAll,
  onToggle,
}: {
  state: WorkAreaState;
  value: string[];
  locked: boolean;
  onToggleAll: () => void;
  onToggle: (code: string) => void;
}) {
  const { space } = useTheme();
  const hints = state.divisions
    .map((d) => ({ name: placeName(d), hint: divisionTowns(d) }))
    .filter((d): d is { name: string; hint: string } => Boolean(d.hint));
  return (
    <View style={{ gap: space.sm }} testID={`area-block-${state.code}`}>
      <Text variant="bodyStrong">{placeName(state)}</Text>
      <View style={[styles.wrap, { gap: space.xs }]}>
        <View style={styles.chip}>
          <Chip
            label={t("painter.nearby.areasAllOf", { state: placeName(state) })}
            selected={value.includes(state.code)}
            disabled={locked}
            onPress={onToggleAll}
            testID={`area-${state.code}`}
          />
        </View>
        {state.divisions.map((division) => (
          <View key={division.code} style={styles.chip}>
            <Chip
              label={placeName(division)}
              selected={hasDivision(value, state, division.code)}
              disabled={locked}
              onPress={() => onToggle(division.code)}
              accessibilityHint={divisionTowns(division) ?? undefined}
              testID={`area-${division.code}`}
            />
          </View>
        ))}
      </View>
      {hints.length > 0 ? (
        <View style={{ gap: 2 }} testID={`area-towns-${state.code}`}>
          {hints.map((d) => (
            <Text key={d.name} variant="caption" tone="mute">
              {`${d.name}: ${d.hint}`}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  // A long name is cut short inside its chip, never past the screen's edge.
  chip: { maxWidth: "100%" },
});
