import Feather from "@expo/vector-icons/Feather";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { messageFor } from "@/api/errors";
import { painterApi, type PainterProfile } from "@/api/endpoints/painter";
import { keys } from "@/api/query-keys";
import { useSession } from "@/auth/session";
import { BackButton, Banner, Button, Chip, ErrorState, ListGroup, ListRow, Screen, Skeleton, Text, TextField, useToast } from "@/components/ui";
import { addItem, AREAS, rupees, SPECIALTIES, tradeBody, wholeNumber } from "@/features/painter/listing";
import { displayPhone } from "@/features/painter/redeem";
import { isNoProfile, usePainterProfile } from "@/features/painter/use-painter";
import { t } from "@/i18n";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useSubmit } from "@/lib/use-submit";
import { fonts, useTheme } from "@/theme";

/**
 * P12 · Trade profile. Spec: docs/05-screens-painter.md — P12. Web reference:
 * HueVistaaPainter app/(app)/profile/profile-screen.tsx.
 *
 * What customers see about this painter's trade: where they work and what they're good at
 * (added one at a time, tidied and never twice, within the server's limits), years in the
 * trade and a day rate in ₹ (emptied, they're cleared). The record — rating and jobs
 * finished — is read-only. The name and mobile have their own screens (S2, S4): a mobile is
 * only ever the one confirmed by text, so it is never sent from here. Settings (S1) is here.
 */
export default function TradeProfile() {
  const router = useRouter();
  const { space } = useTheme();
  const queryClient = useQueryClient();
  const painter = usePainterProfile();
  const settingUp = useSubmit();
  const [setUpError, setSetUpError] = useState<string | null>(null);
  const p = painter.data;

  if (p) return <TradeForm key={JSON.stringify([p.serviceAreas, p.specialties, p.yearsExperience, p.dayRateInr])} profile={p} onRefresh={() => painter.refetch()} />;

  return (
    <Screen scroll contentStyle={{ gap: space.lg }}>
      <BackButton fallback="/painter" />
      <Text variant="title1" accessibilityRole="header">
        {t("painter.profile.title")}
      </Text>
      {painter.isPending ? (
        <View style={{ gap: space.sm }} testID="profile-loading">
          <Skeleton height={56} radius={16} />
          <Skeleton height={160} radius={16} />
        </View>
      ) : isNoProfile(painter.error) ? (
        // A painter account with no painter profile behind it: one tap makes it (idempotent).
        <View style={{ gap: space.sm }} testID="profile-missing">
          <Text variant="painterStrong">{t("painter.profile.missingTitle")}</Text>
          <Text variant="painterBody" tone="soft">
            {t("painter.profile.missingBody")}
          </Text>
          {setUpError ? <Banner tone="danger" message={setUpError} /> : null}
          <Button
            label={t("painter.profile.setUp")}
            loading={settingUp.busy}
            onPress={() =>
              void settingUp.run(async () => {
                setSetUpError(null);
                try {
                  queryClient.setQueryData(keys.painterProfile, await painterApi.becomePainter());
                } catch (err) {
                  setSetUpError(messageFor(err));
                }
              })
            }
          />
        </View>
      ) : (
        <ErrorState error={painter.error} onRetry={() => void painter.refetch()} />
      )}
      <ListGroup>
        <ListRow icon="settings" title={t("painter.profile.settings")} onPress={() => router.push("/settings")} />
      </ListGroup>
    </Screen>
  );
}

function TradeForm({ profile, onRefresh }: { profile: PainterProfile; onRefresh: () => Promise<unknown> }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { space } = useTheme();
  const { profile: account } = useSession();
  const pull = usePullToRefresh(onRefresh);
  const saving = useSubmit();
  const [areas, setAreas] = useState<string[]>(profile.serviceAreas ?? []);
  const [specialties, setSpecialties] = useState<string[]>(profile.specialties ?? []);
  const [areaDraft, setAreaDraft] = useState("");
  const [specialtyDraft, setSpecialtyDraft] = useState("");
  const [areaProblem, setAreaProblem] = useState<string | null>(null);
  const [specialtyProblem, setSpecialtyProblem] = useState<string | null>(null);
  const [years, setYears] = useState(profile.yearsExperience != null ? String(profile.yearsExperience) : "");
  const [dayRate, setDayRate] = useState(profile.dayRateInr != null ? String(Math.round(profile.dayRateInr)) : "");
  const [error, setError] = useState<string | null>(null);

  const yearsValue = wholeNumber(years);
  const rateValue = wholeNumber(dayRate);
  const same = (a: readonly string[], b: readonly string[] | null | undefined) => JSON.stringify(a) === JSON.stringify(b ?? []);
  const dirty =
    !same(areas, profile.serviceAreas) ||
    !same(specialties, profile.specialties) ||
    yearsValue !== (profile.yearsExperience ?? null) ||
    rateValue !== (profile.dayRateInr != null ? Math.round(profile.dayRateInr) : null);
  const valid = yearsValue !== undefined && rateValue !== undefined;

  const add = (kind: "areas" | "specialties", raw: string) => {
    const limits = kind === "areas" ? AREAS : SPECIALTIES;
    const { list, problem } = addItem(kind === "areas" ? areas : specialties, raw, limits);
    const said = problem === "tooLong" ? t("painter.profile.tooLong", { n: limits.maxLength }) : problem === "tooMany" ? t("painter.profile.tooMany") : null;
    if (kind === "areas") {
      setAreas(list);
      setAreaProblem(said);
      if (!problem) setAreaDraft("");
    } else {
      setSpecialties(list);
      setSpecialtyProblem(said);
      if (!problem) setSpecialtyDraft("");
    }
  };

  const save = () =>
    void saving.run(async () => {
      setError(null);
      // A word still in a box was meant to be added.
      let a = areas;
      let s = specialties;
      if (areaDraft.trim()) a = addItem(a, areaDraft, AREAS).list;
      if (specialtyDraft.trim()) s = addItem(s, specialtyDraft, SPECIALTIES).list;
      try {
        const updated = await painterApi.updateProfile(tradeBody({ areas: a, specialties: s, years: yearsValue ?? null, dayRate: rateValue ?? null }));
        queryClient.setQueryData(keys.painterProfile, updated);
        toast.show(t("painter.profile.saved"), "success");
      } catch (err) {
        setError(messageFor(err, t("painter.profile.failed")));
      }
    });

  const suggestions = t("painter.profile.suggestions")
    .split("|")
    .filter((x) => !specialties.some((s) => s.toLowerCase() === x.toLowerCase()));
  const name = (account?.namePending ? null : account?.name?.trim()) || profile.name?.trim() || "";
  const mobile = profile.phoneVerified && profile.phone ? displayPhone(profile.phone) : profile.pendingPhone ? t("painter.profile.mobileWaiting") : t("painter.profile.mobileNone");
  const rating =
    profile.rating != null && (profile.ratingCount ?? 0) > 0
      ? profile.ratingCount === 1
        ? t("painter.profile.ratingOne", { rating: profile.rating.toFixed(1) })
        : t("painter.profile.rating", { rating: profile.rating.toFixed(1), n: profile.ratingCount ?? 0 })
      : t("painter.profile.noReviews");
  const jobs = (profile.jobsCompleted ?? 0) === 1 ? t("painter.profile.jobsOne") : t("painter.profile.jobs", { n: profile.jobsCompleted ?? 0 });

  return (
    <Screen
      scroll
      onRefresh={pull.onRefresh}
      refreshing={pull.refreshing}
      contentStyle={{ gap: space.lg, paddingBottom: space.xl }}
      footer={
        <View style={{ gap: space.xs }}>
          {error ? <Banner tone="danger" message={error} testID="profile-error" /> : null}
          <Button label={t("painter.profile.save")} onPress={save} loading={saving.busy} disabled={!valid || (!dirty && !areaDraft.trim() && !specialtyDraft.trim())} testID="profile-save" />
        </View>
      }
    >
      <BackButton fallback="/painter" />
      <View style={{ gap: space.xs }}>
        <Text variant="title1" accessibilityRole="header">
          {t("painter.profile.title")}
        </Text>
        <Text variant="painterBody" tone="soft">
          {t("painter.profile.lead")}
        </Text>
      </View>

      <ListGroup>
        <ListRow icon="user" title={t("painter.profile.name")} value={name} onPress={() => router.push("/edit-name")} />
        <ListRow icon="phone" title={t("painter.profile.mobile")} value={mobile} onPress={() => router.push("/mobile-number")} testID="profile-mobile" />
      </ListGroup>

      <ItemList
        title={t("painter.profile.areas")}
        hint={t("painter.profile.areasHint")}
        placeholder={t("painter.profile.areasPlaceholder")}
        items={areas}
        draft={areaDraft}
        problem={areaProblem}
        onDraft={(v) => {
          setAreaDraft(v);
          setAreaProblem(null);
        }}
        onAdd={() => add("areas", areaDraft)}
        onRemove={(item) => setAreas((list) => list.filter((x) => x !== item))}
        testID="profile-areas"
      />

      <ItemList
        title={t("painter.profile.specialties")}
        hint={t("painter.profile.specialtiesHint")}
        placeholder={t("painter.profile.specialtiesPlaceholder")}
        items={specialties}
        draft={specialtyDraft}
        problem={specialtyProblem}
        onDraft={(v) => {
          setSpecialtyDraft(v);
          setSpecialtyProblem(null);
        }}
        onAdd={() => add("specialties", specialtyDraft)}
        onRemove={(item) => setSpecialties((list) => list.filter((x) => x !== item))}
        testID="profile-specialties"
      >
        {suggestions.length ? (
          <View style={[styles.wrap, { gap: space.xs }]}>
            {suggestions.map((s) => (
              <Chip key={s} label={`+ ${s}`} selected={false} onPress={() => add("specialties", s)} />
            ))}
          </View>
        ) : null}
      </ItemList>

      <View style={[styles.row, { gap: space.sm }]}>
        <View style={styles.fill}>
          <TextField
            label={t("painter.profile.years")}
            value={years}
            onChangeText={setYears}
            keyboardType="number-pad"
            maxLength={2}
            error={yearsValue === undefined ? t("painter.profile.numberOnly") : null}
            testID="profile-years"
          />
        </View>
        <View style={styles.fill}>
          <TextField
            label={t("painter.profile.dayRate")}
            value={dayRate}
            onChangeText={setDayRate}
            keyboardType="number-pad"
            maxLength={6}
            error={rateValue === undefined ? t("painter.profile.numberOnly") : null}
            testID="profile-day-rate"
          />
        </View>
      </View>
      {rateValue ? (
        <Text variant="small" tone="soft">
          {t("painter.profile.dayRateShown", { rupees: rupees(rateValue) })}
        </Text>
      ) : null}

      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="mute">
          {t("painter.profile.record")}
        </Text>
        <Text variant="painterBody">{rating}</Text>
        <Text variant="painterBody">{jobs}</Text>
      </View>

      <ListGroup>
        <ListRow
          icon="map-pin"
          title={t("painter.profile.listing")}
          value={profile.listedForCustomers ? t("painter.profile.listingShown") : t("painter.profile.listingHidden")}
          onPress={() => router.push("/painter/nearby")}
        />
        <ListRow icon="settings" title={t("painter.profile.settings")} onPress={() => router.push("/settings")} testID="profile-settings" />
      </ListGroup>

      <ListGroup>
        <ListRow icon="life-buoy" title={t("account.helpSupport")} onPress={() => router.push("/help")} testID="profile-help" />
        <ListRow icon="message-circle" title={t("account.questions")} onPress={() => router.push("/questions")} />
      </ListGroup>
    </Screen>
  );
}

/** A list the painter adds to one at a time: what's there (each removable), and a box to add. */
function ItemList({
  title,
  hint,
  placeholder,
  items,
  draft,
  problem,
  onDraft,
  onAdd,
  onRemove,
  children,
  testID,
}: {
  title: string;
  hint: string;
  placeholder: string;
  items: string[];
  draft: string;
  problem: string | null;
  onDraft: (v: string) => void;
  onAdd: () => void;
  onRemove: (item: string) => void;
  children?: React.ReactNode;
  testID?: string;
}) {
  const { colors, radius, space } = useTheme();
  return (
    <View style={{ gap: space.sm }} testID={testID}>
      <Text variant="title3" accessibilityRole="header">
        {title}
      </Text>
      {items.length ? (
        <View style={[styles.wrap, { gap: space.xs }]}>
          {items.map((item) => (
            <Pressable
              key={item}
              onPress={() => onRemove(item)}
              accessibilityRole="button"
              accessibilityLabel={t("painter.profile.remove", { item })}
              hitSlop={{ top: 6, bottom: 6 }}
              style={[styles.item, { backgroundColor: colors.fg, borderRadius: radius.pill }]}
            >
              <Text style={[styles.itemText, { color: colors.bg }]} numberOfLines={1}>
                {item}
              </Text>
              <Feather name="x" size={16} color={colors.bg} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={[styles.row, { gap: space.sm, alignItems: "flex-end" }]}>
        <View style={styles.fill}>
          <TextField label={hint} placeholder={placeholder} value={draft} onChangeText={onDraft} onSubmitEditing={onAdd} returnKeyType="done" error={problem} autoCapitalize="words" />
        </View>
        {/* In a view of its own: the button's own alignment would lift it off the field's line. */}
        <View>
          <Button variant="secondary" block={false} label={t("painter.profile.add")} onPress={onAdd} disabled={!draft.trim()} />
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  fill: { flex: 1 },
  item: { minHeight: 36, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  itemText: { fontFamily: fonts.medium, fontSize: 15, flexShrink: 1 },
});
