import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { WorkAreaState, WorkAreas } from "@/api/endpoints/nearby";
import { Button, Chip, Switch, Text } from "@/components/ui";
import { hasDivision, placeName, toggleDivision, toggleState } from "@/features/nearby/work-areas";
import { getLanguage, t } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * Where the painter can go for a job (P5), in the order a painter thinks about it: the divisions
 * of Rajasthan first, then Gujarat's regions, then any other state — and last, anywhere in India.
 * A chip for each, with the big towns in each listed under them; "All of Rajasthan" ticks every
 * division at once. As the painter website's work-areas-picker.tsx.
 *
 * Every state is split — into its divisions, or its usual regions — and the catalogue says which
 * are drawn open at the top (`featured`: Rajasthan and Gujarat), so a change there needs no new
 * build. The other thirty-odd are a chip each, folded behind "Show all states" (the ones already
 * chosen always show): pressing one opens its divisions below, one state at a time. While
 * anywhere in India is on the rest is greyed out; turning it off brings back what was chosen before.
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
  const { space, colors, radius } = useTheme();
  const [showAll, setShowAll] = useState(false);
  /** The other state whose divisions are open below the chips; one at a time. */
  const [opened, setOpened] = useState<string | null>(null);
  /** What was chosen before "Anywhere in India" was switched on, to give back when it is off. */
  const before = useRef<string[]>([]);

  const anywhere = value.includes(catalogue.anywhere);
  const locked = disabled || anywhere;
  const featured = catalogue.states.filter((s) => s.featured);
  const others = catalogue.states.filter((s) => !s.featured);
  const chosenIn = (state: WorkAreaState) => value.includes(state.code) || state.divisions.some((d) => value.includes(d.code));
  const listed = showAll ? others : others.filter(chosenIn);
  const openState = others.find((s) => s.code === opened) ?? null;

  /** "· All" for a whole state, "· 2" for two of its divisions, nothing for none. */
  const summary = (state: WorkAreaState) => {
    if (value.includes(state.code)) return ` · ${t("painter.nearby.areasWhole")}`;
    const count = state.divisions.filter((d) => value.includes(d.code)).length;
    return count > 0 ? ` · ${count}` : "";
  };

  const block = (state: WorkAreaState) => (
    <StateBlock
      key={state.code}
      state={state}
      value={value}
      locked={locked}
      onToggleAll={() => onChange(toggleState(value, state, catalogue))}
      onToggle={(code) => onChange(toggleDivision(value, state, code, catalogue))}
    />
  );

  return (
    <View style={{ gap: space.lg }} testID="nearby-areas">
      {featured.map(block)}

      <View style={{ gap: space.sm }}>
        <Text variant="bodyStrong">{t("painter.nearby.areasOtherStates")}</Text>
        <Text variant="small" tone="soft">
          {t("painter.nearby.areasOtherHint")}
        </Text>
        {listed.length > 0 ? (
          <View style={[styles.wrap, { gap: space.xs }]}>
            {listed.map((state) => (
              <View key={state.code} style={styles.chip}>
                <Chip
                  label={`${placeName(state)}${summary(state)}`}
                  selected={opened === state.code}
                  onPress={() => setOpened((was) => (was === state.code ? null : state.code))}
                  testID={`area-state-${state.code}`}
                />
              </View>
            ))}
          </View>
        ) : null}
        {openState ? (
          <View style={[styles.panel, { padding: space.md, borderRadius: radius.md, borderColor: colors.ruleStrong, backgroundColor: colors.surfaceSoft }]}>
            {block(openState)}
          </View>
        ) : null}
        <Button
          variant="ghost"
          block={false}
          label={showAll ? t("painter.nearby.areasHideStates") : t("painter.nearby.areasShowStates")}
          onPress={() => {
            setShowAll((was) => !was);
            setOpened(null);
          }}
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
              accessibilityHint={(hindi ? division.hintHi : division.hint) ?? undefined}
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
  panel: { borderWidth: StyleSheet.hairlineWidth },
});
