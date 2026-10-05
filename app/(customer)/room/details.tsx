import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { projectsApi } from "@/api/endpoints/projects";
import { messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import { FormScreen } from "@/components/FormScreen";
import { Banner, Button, Chip, EmptyState, Screen, Text, TextField } from "@/components/ui";
import { useBalance } from "@/features/account/use-balance";
import { clearUpload, retryUpload, useUpload } from "@/features/studio/photo-upload";
import { defaultRoomName, ROOM_TYPES } from "@/features/studio/room-names";
import { t, type MessageKey } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/**
 * C7 · Name it (still step 1). Spec: docs/04-screens-customer.md — C7.
 *
 * The photo is uploading while this is filled in; Create waits for it, then spends one
 * room (`POST /api/projects`) and opens Tidy up.
 */
export default function NameIt() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, radius, space } = useTheme();
  const params = useLocalSearchParams<{ shade?: string; brand?: string }>();
  const upload = useUpload();
  const balance = useBalance();
  const [roomType, setRoomType] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmit();

  if (upload.status === "idle") {
    return (
      <Screen>
        <EmptyState
          icon="camera"
          title={t("details.noPhoto")}
          actionLabel={t("studio.start")}
          onAction={() => router.replace("/room/new")}
        />
      </Screen>
    );
  }

  const shownName = name ?? defaultRoomName(roomType);
  const ready = upload.status === "done";

  const create = () => {
    if (upload.status !== "done") return;
    void run(async () => {
      setError(null);
      try {
        const room = await projectsApi.create({
          imageId: upload.image.imageId,
          name: shownName.trim() || defaultRoomName(roomType),
          roomType: roomType ?? undefined,
        });
        // A room was spent and a new one is in the list.
        void queryClient.invalidateQueries({ queryKey: keys.projects });
        void queryClient.invalidateQueries({ queryKey: keys.entitlement });
        void queryClient.invalidateQueries({ queryKey: keys.projectOptions });
        clearUpload();
        router.replace({
          pathname: "/room/[projectId]/tidy",
          params: { projectId: room.id, shade: params.shade, brand: params.brand },
        } as Href);
      } catch (err) {
        setError(messageFor(err));
      }
    });
  };

  const retake = () => {
    clearUpload();
    router.replace({ pathname: "/room/new", params: { shade: params.shade, brand: params.brand } });
  };

  const percent = upload.status === "uploading" ? Math.round(upload.progress * 100) : 100;

  return (
    <FormScreen
      title={t("details.title")}
      lead={t("details.lead")}
      backFallback="/room/new"
      footer={<Button label={t("details.create")} onPress={create} disabled={!ready} loading={busy} />}
    >
      <View style={{ gap: space.xs }}>
        <View style={[styles.track, { backgroundColor: colors.surfaceSoft, borderRadius: radius.pill }]}>
          <View
            style={[
              styles.bar,
              {
                width: `${upload.status === "failed" ? 100 : percent}%`,
                backgroundColor: upload.status === "failed" ? colors.dangerText : colors.accent,
                borderRadius: radius.pill,
              },
            ]}
          />
        </View>
        <Text variant="small" tone="mute" accessibilityLiveRegion="polite" testID="upload-status">
          {upload.status === "uploading"
            ? t("details.uploading", { percent })
            : upload.status === "done"
              ? t("details.uploaded")
              : null}
        </Text>
      </View>

      {upload.status === "failed" ? (
        <View style={{ gap: space.xs }}>
          <Banner tone="danger" message={upload.notRoom ? t("details.notRoom") : t("details.uploadFailed")} />
          <Button
            variant="secondary"
            label={upload.notRoom ? t("details.retake") : t("details.retry")}
            onPress={upload.notRoom ? retake : retryUpload}
          />
        </View>
      ) : null}

      <Image
        source={{ uri: upload.photo.file.uri }}
        style={[styles.photo, { borderRadius: radius.md, aspectRatio: upload.photo.width / Math.max(1, upload.photo.height) }]}
        contentFit="cover"
        accessibilityLabel={shownName}
      />

      <TextField
        label={t("details.name")}
        value={shownName}
        onChangeText={(v) => {
          setName(v);
          setError(null);
        }}
        maxLength={200}
        returnKeyType="done"
      />

      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="mute">
          {t("details.what")}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }} keyboardShouldPersistTaps="handled">
          {ROOM_TYPES.map((type) => (
            <Chip
              key={type.value}
              label={t(`details.types.${type.key}` as MessageKey)}
              selected={roomType === type.value}
              onPress={() => setRoomType(roomType === type.value ? null : type.value)}
            />
          ))}
        </ScrollView>
      </View>

      {balance.loaded && balance.rooms > 0 ? (
        <Text variant="small" tone="soft">
          {balance.rooms === 1 ? t("details.usesOne") : t("details.uses", { n: balance.rooms })}
        </Text>
      ) : null}

      {error ? <Banner tone="danger" message={error} /> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, overflow: "hidden" },
  bar: { height: 6 },
  photo: { width: "100%", maxHeight: 280 },
});
