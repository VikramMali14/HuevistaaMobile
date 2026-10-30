import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { WorkAreaState, WorkAreas } from "@/api/endpoints/nearby";
import { Button, Chip, Switch, Text } from "@/components/ui";
import { hasDivision, placeName, toggleDivision, toggleState } from "@/features/nearby/work-areas";
import { getLanguage, t } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * Where the painter can go for a job (P5), in the order a painter thinks about it: the divisions
 * of Rajasthan first, then Gujarat's regions, then any other state whole — and last, anywhere in
 * India. A chip for each; "All of Rajasthan" ticks every division at once. As the painter
 * website's work-areas-picker.tsx.
 *
 * The states with divisions are drawn from the catalogue, so one given divisions on the server
 * gets a block here with no new build. The other thirty-odd states fold away behind "Show all
 * states", always showing the ones already chosen. While anywhere in India is on the rest is
 * greyed out; turning it off brings back what was chosen before.
 */
export function WorkAreasPicker({
  catalogue,
  value,
  onChange,
  disabled = false,
}: {
  catalogue: WorkAreas;
  /** As the server keeps it — see features/nearby/work-areas.ts. */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const { space } = useTheme();
  const [open, setOpen] = useState(false);
  /** What was chosen before "Anywhere in India" was switched on, to give back when it is off. */
  const before = useRef<string[]>([]);

  const anywhere = value.includes(catalogue.anywhere);
  const locked = disabled || anywhere;
  const divided = catalogue.states.filter((s) => s.divisions.length > 0);
  const whole = catalogue.states.filter((s) => s.divisions.length === 0);
  const shownWhole = open ? whole : whole.filter((s) => value.includes(s.code));

  return (
    <View style={{ gap: space.lg }} testID="nearby-areas">
      {divided.map((state) => (
        <StateBlock
          key={state.code}
          state={state}
          value={value}
          locked={locked}
          onToggleAll={() => onChange(toggleState(value, state, catalogue))}
          onToggle={(code) => onChange(toggleDivision(value, state, code, catalogue))}
        />
      ))}

      <View style={{ gap: space.sm }}>
        <Text variant="bodyStrong">{t("painter.nearby.areasOtherStates")}</Text>
        {shownWhole.length > 0 ? (
          <View style={[styles.wrap, { gap: space.xs }]}>
            {shownWhole.map((state) => (
              <View key={state.code} style={styles.chip}>
                <Chip
                  label={placeName(state)}
                  selected={value.includes(state.code)}
                  disabled={locked}
                  onPress={() => onChange(toggleState(value, state, catalogue))}
                  testID={`area-${state.code}`}
                />
              </View>
            ))}
          </View>
        ) : null}
        <Button
          variant="ghost"
          block={false}
          label={open ? t("painter.nearby.areasHideStates") : t("painter.nearby.areasShowStates")}
          onPress={() => setOpen((was) => !was)}
          testID="area-more"
        />
      </View>

      <Switch
        label={t("painter.nearby.areasAnywhere")}
        note={anywhere ? t("painter.nearby.areasAnywhereOn") : t("painter.nearby.areasAnywhereNote")}
        value={anywhere}
        disabled={disabled}
        onValueChange={(on) => {
          if (on) {
            before.current = value;
            onChange([catalogue.anywhere]);
          } else {
            onChange(before.current.filter((c) => c !== catalogue.anywhere));
          }
        }}
        testID="area-anywhere"
      />
    </View>
  );
}

/** A state with divisions: "All of …", then each division — and the towns in a region not named after one. */
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
  const hindi = getLanguage() === "hi";
  const hints = state.divisions
    .map((d) => ({ name: placeName(d), hint: hindi ? d.hintHi : d.hint }))
    .filter((d): d is { name: string; hint: string } => Boolean(d.hint));
  return (
    <View style={{ gap: space.sm }}>
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
              testID={`area-${division.code}`}
            />
          </View>
        ))}
      </View>
      {hints.length > 0 ? (
        <View style={{ gap: 2 }}>
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
