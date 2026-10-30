import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { WorkAreaState, WorkAreas } from "@/api/endpoints/nearby";
import { Button, Chip, Switch, Text } from "@/components/ui";
import { hasDivision, placeName, toggleDivision, toggleState } from "@/features/nearby/work-areas";
import { getLanguage, t } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * Where the painter can go for a job (P5), in the order a painter thinks about it: their own state
 * first — the one their location is in — then any other state, and last, anywhere in India. As the
 * painter website's work-areas-picker.tsx.
 *
 * Each state is a chip. Pressing one opens its divisions below — a chip each, with the big towns in
 * each listed under them, and "All of Rajasthan" to tick every division at once — one state at a
 * time. The other states are folded behind "Show all states" (the ones already chosen always
 * show); with no location yet there is no state of their own, and every state waits behind the
 * same button. While anywhere in India is on the rest is greyed out; turning it off brings back
 * what was chosen before.
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
  const { space, colors, radius } = useTheme();
  const [showAll, setShowAll] = useState(false);
  /** The state whose divisions are open below its chip; one at a time. */
  const [opened, setOpened] = useState<string | null>(null);
  /** What was chosen before "Anywhere in India" was switched on, to give back when it is off. */
  const before = useRef<string[]>([]);

  const anywhere = value.includes(catalogue.anywhere);
  const locked = disabled || anywhere;
  const home = catalogue.states.find((s) => s.code === homeState) ?? null;
  const others = catalogue.states.filter((s) => s !== home);
  const chosenIn = (state: WorkAreaState) => value.includes(state.code) || state.divisions.some((d) => value.includes(d.code));
  const listed = showAll ? others : others.filter(chosenIn);
  const openOther = others.find((s) => s.code === opened) ?? null;

  /** "· All" for a whole state, "· 2" for two of its divisions, nothing for none. */
  const summary = (state: WorkAreaState) => {
    if (value.includes(state.code)) return ` · ${t("painter.nearby.areasWhole")}`;
    const count = state.divisions.filter((d) => value.includes(d.code)).length;
    return count > 0 ? ` · ${count}` : "";
  };

  const chip = (state: WorkAreaState) => (
    <View key={state.code} style={styles.chip}>
      <Chip
        label={`${placeName(state)}${summary(state)}`}
        selected={opened === state.code}
        onPress={() => setOpened((was) => (was === state.code ? null : state.code))}
        testID={`area-state-${state.code}`}
      />
    </View>
  );

  const panel = (state: WorkAreaState) => (
    <View style={[styles.panel, { padding: space.md, borderRadius: radius.md, borderColor: colors.ruleStrong, backgroundColor: colors.surfaceSoft }]}>
      <StateBlock
        state={state}
        value={value}
        locked={locked}
        onToggleAll={() => onChange(toggleState(value, state, catalogue))}
        onToggle={(code) => onChange(toggleDivision(value, state, code, catalogue))}
      />
    </View>
  );

  return (
    <View style={{ gap: space.lg }} testID="nearby-areas">
      <Text variant="small" tone="soft">
        {t("painter.nearby.areasOtherHint")}
      </Text>

      {home ? (
        <View style={{ gap: space.sm }} testID="area-home">
          <Text variant="bodyStrong">{t("painter.nearby.areasYourState")}</Text>
          <View style={[styles.wrap, { gap: space.xs }]}>{chip(home)}</View>
          {opened === home.code ? panel(home) : null}
        </View>
      ) : null}

      <View style={{ gap: space.sm }} testID="area-others">
        <Text variant="bodyStrong">{home ? t("painter.nearby.areasOtherStates") : t("painter.nearby.areasStates")}</Text>
        {listed.length > 0 ? <View style={[styles.wrap, { gap: space.xs }]}>{listed.map(chip)}</View> : null}
        {openOther ? panel(openOther) : null}
        <Button
          variant="ghost"
          block={false}
          label={showAll ? t("painter.nearby.areasHideStates") : t("painter.nearby.areasShowStates")}
          onPress={() => {
            setShowAll((was) => !was);
            setOpened((was) => (was === home?.code ? was : null));
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
