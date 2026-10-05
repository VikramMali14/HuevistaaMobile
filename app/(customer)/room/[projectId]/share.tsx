import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, Share, StyleSheet, View } from "react-native";

import { projectsApi } from "@/api/endpoints/projects";
import { shadesApi } from "@/api/endpoints/shades";
import { messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import { FormScreen } from "@/components/FormScreen";
import { Banner, Button, Chip, ConfirmSheet, ErrorState, Segmented, Text, useToast } from "@/components/ui";
import { env } from "@/config/env";
import { useRoom } from "@/features/studio/use-room";
import { t } from "@/i18n";
import { formatDate } from "@/lib/dates";
import { useSubmit } from "@/lib/use-submit";
import { hairline, useTheme } from "@/theme";

type Days = 3 | 7 | 10;

/**
 * C17 · Share this room. Spec: docs/04-screens-customer.md — C17.
 *
 * A link anyone can open to see the room and try shades on it; nothing they do changes
 * this one. How long it works and which companies they may use, then WhatsApp, Copy or
 * the phone's own share sheet; a live link shows when it stops and can be stopped. As
 * built: the backend takes 3, 7 or 10 days (it makes anything else 10), and companies by
 * NAME — the docs said 1–10 days and slugs.
 */
export default function ShareRoom() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { colors, radius, space } = useTheme();
  const { projectId: id = "" } = useLocalSearchParams<{ projectId: string }>();
  const room = useRoom(id);
  const brands = useQuery({ queryKey: keys.myBrands, queryFn: shadesApi.myBrands, staleTime: 60 * 60_000 });
  const [days, setDays] = useState<Days>(10);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [made, setMade] = useState<{ url: string; expiresAt?: string | null } | null | undefined>(undefined);
  const [changing, setChanging] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useSubmit();
  const stop = useSubmit();

  const data = room.data;
  if (room.isError) {
    return (
      <FormScreen title={t("share.title")} backFallback="/studio">
        <ErrorState error={room.error} onRetry={() => void room.refetch()} />
      </FormScreen>
    );
  }
  if (!data) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: colors.bg }]} testID="share-loading">
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  const name = data.name?.trim() || t("rooms.untitled");
  // The room's own live link until this sheet makes, changes or stops one.
  const fromRoom = data.hasShareLink && data.shareToken ? { url: `${env.siteOrigin}/share/${data.shareToken}`, expiresAt: data.shareExpiresAt } : null;
  const link = made === undefined ? fromRoom : made;
  const companies = (brands.data ?? []).map((b) => b.name).filter(Boolean);
  const editing = !link || changing;
  const message = link ? t("share.message", { room: name, url: link.url }) : "";

  const refreshRoom = () => queryClient.invalidateQueries({ queryKey: keys.room(id) });

  const save = () => {
    if (picked && picked.length === 0) {
      setError(t("share.pickSome"));
      return;
    }
    void saving.run(async () => {
      setError(null);
      try {
        const res = await projectsApi.share(id, days, picked ?? undefined);
        setMade({ url: res.shareUrl, expiresAt: res.expiresAt });
        setChanging(false);
        void refreshRoom();
        void queryClient.invalidateQueries({ queryKey: keys.projects });
      } catch (err) {
        setError(messageFor(err));
      }
    });
  };

  const stopSharing = () =>
    void stop.run(async () => {
      setError(null);
      try {
        await projectsApi.unshare(id);
        setMade(null);
        setStopping(false);
        toast.show(t("share.stopped"), "info");
        void refreshRoom();
        void queryClient.invalidateQueries({ queryKey: keys.projects });
      } catch (err) {
        setStopping(false);
        setError(messageFor(err));
      }
    });

  const flip = (company: string) => {
    setError(null);
    setPicked((list) => {
      const current = list ?? [];
      return current.includes(company) ? current.filter((c) => c !== company) : [...current, company];
    });
  };

  return (
    <FormScreen
      title={t("share.title")}
      lead={t("share.lead")}
      backFallback="/studio"
      footer={editing ? <Button label={link ? t("share.update") : t("share.make")} icon="link" onPress={save} loading={saving.busy} testID="share-make" /> : undefined}
    >
      {link && !changing ? (
        <View style={{ gap: space.md }}>
          <View style={[styles.link, { borderColor: colors.ruleStrong, borderRadius: radius.sm, backgroundColor: colors.surfaceSoft }]}>
            <Text variant="small" selectable accessibilityLabel={t("share.linkLabel")} testID="share-url">
              {link.url}
            </Text>
          </View>
          {link.expiresAt ? (
            <Text variant="small" tone="mute">
              {t("share.until", { date: formatDate(link.expiresAt) })}
            </Text>
          ) : null}
          <Button
            label={t("share.whatsapp")}
            icon="message-circle"
            onPress={() => void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`).catch(() => {})}
          />
          <View style={[styles.row, { gap: space.xs }]}>
            <View style={styles.fill}>
              <Button
                variant="secondary"
                icon="copy"
                label={t("share.copy")}
                onPress={() =>
                  void Clipboard.setStringAsync(link.url)
                    .then(() => toast.show(t("share.copied"), "success"))
                    .catch(() => {})
                }
              />
            </View>
            <View style={styles.fill}>
              <Button variant="secondary" icon="share-2" label={t("share.more")} onPress={() => void Share.share({ message }).catch(() => {})} />
            </View>
          </View>
          <Button variant="ghost" block={false} label={t("share.change")} onPress={() => setChanging(true)} />
          <Button variant="ghost" block={false} label={t("share.stop")} onPress={() => setStopping(true)} testID="share-stop" />
        </View>
      ) : (
        <>
          <View style={{ gap: space.xs }}>
            <Text variant="label" tone="mute">
              {t("share.howLong")}
            </Text>
            <Segmented
              accessibilityLabel={t("share.howLong")}
              value={String(days)}
              onChange={(v) => setDays(Number(v) as Days)}
              options={([3, 7, 10] as const).map((n) => ({ value: String(n), label: t("share.days", { n }) }))}
            />
          </View>
          {companies.length > 1 ? (
            <View style={{ gap: space.xs }}>
              <Text variant="label" tone="mute">
                {t("share.companies")}
              </Text>
              <View style={[styles.wrap, { gap: space.xs }]}>
                <Chip label={t("share.allCompanies")} selected={picked === null} onPress={() => setPicked(null)} />
                {companies.map((company) => (
                  <Chip key={company} label={company} selected={Boolean(picked?.includes(company))} onPress={() => flip(company)} />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
      {error ? <Banner tone="danger" message={error} testID="share-error" /> : null}

      <ConfirmSheet
        visible={stopping}
        title={t("share.stopTitle")}
        body={t("share.stopBody")}
        confirmLabel={t("share.stop")}
        destructive
        loading={stop.busy}
        onConfirm={stopSharing}
        onCancel={() => setStopping(false)}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  link: { borderWidth: hairline, padding: 12 },
});
