import { useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { projectsApi } from "@/api/endpoints/projects";
import { messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { ProjectSummary } from "@/api/types";
import {
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  Screen,
  Segmented,
  Sheet,
  Skeleton,
  Text,
  TextField,
  useToast,
} from "@/components/ui";
import { forgetBoard } from "@/features/boards/made-boards";
import { useLibrary } from "@/features/library/use-library";
import { forgetRoom } from "@/features/studio/paint-store";
import { forgetTray } from "@/features/studio/tray-store";
import { StudioRoomRow } from "@/features/rooms/StudioRoomRow";
import { byRecentActivity, isInProgress } from "@/features/rooms/room-status";
import { useProjects } from "@/features/rooms/use-rooms";
import { t } from "@/i18n";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

type Tab = "open" | "done";

/**
 * C2 · Studio — your rooms. Spec: docs/04-screens-customer.md — C2.
 *
 * Every room, newest activity first, split into In progress and Finished; a tap opens the
 * room at its step, a long press renames, shares or deletes it. New room is always one tap
 * away.
 */
export default function StudioScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { space } = useTheme();
  const projects = useProjects();
  const library = useLibrary();
  const pull = usePullToRefresh(projects.refetch);
  const [tab, setTab] = useState<Tab>("open");
  const [menu, setMenu] = useState<ProjectSummary | null>(null);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = useSubmit();

  const all = [...(projects.data ?? [])].sort(byRecentActivity);
  const open = all.filter(isInProgress);
  const done = all.filter((p) => !isInProgress(p));
  const shown = tab === "open" ? open : done;

  const refreshRooms = () => queryClient.invalidateQueries({ queryKey: keys.projects });

  const rename = () => {
    const room = renaming;
    const next = name.trim();
    if (!room || !next) return;
    void saving.run(async () => {
      setError(null);
      try {
        await projectsApi.rename(room.id, next);
        await refreshRooms();
        setRenaming(null);
        toast.show(t("studio.renamed"), "success");
      } catch (err) {
        setError(messageFor(err));
      }
    });
  };

  const remove = () => {
    const room = deleting;
    if (!room) return;
    void saving.run(async () => {
      setError(null);
      try {
        await projectsApi.remove(room.id);
        // Nothing of it is kept or sent again: its unsaved colours, its tray, its cache.
        forgetRoom(room.id);
        forgetTray(room.id);
        forgetBoard(room.id);
        queryClient.removeQueries({ queryKey: keys.room(room.id) });
        await refreshRooms();
        setDeleting(null);
        toast.show(t("studio.deleted"), "success");
      } catch (err) {
        setError(messageFor(err));
      }
    });
  };

  let body;
  if (projects.isPending) {
    body = (
      <View style={{ gap: space.sm }} testID="studio-loading">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={96} radius={16} />
        ))}
      </View>
    );
  } else if (projects.isError) {
    body = <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />;
  } else if (all.length === 0) {
    body = (
      <View style={{ gap: space.sm }}>
        <EmptyState
          icon="image"
          title={t("studio.emptyTitle")}
          body={t("studio.emptyBody")}
          actionLabel={t("studio.start")}
          onAction={() => router.push("/room/new")}
        />
        {library.live ? (
          <Button variant="secondary" label={t("studio.tryReady")} onPress={() => router.push("/library")} />
        ) : null}
      </View>
    );
  } else if (shown.length === 0) {
    body = (
      <EmptyState
        icon={tab === "open" ? "check-circle" : "clock"}
        title={tab === "open" ? t("studio.noneInProgress") : t("studio.noneFinished")}
        body={tab === "open" ? t("studio.noneInProgressBody") : t("studio.noneFinishedBody")}
      />
    );
  } else {
    body = (
      <View style={{ gap: space.sm }}>
        {shown.map((room) => (
          <StudioRoomRow
            key={room.id}
            room={room}
            onPress={() => router.push({ pathname: "/room/[projectId]", params: { projectId: room.id } } as Href)}
            onLongPress={() => setMenu(room)}
          />
        ))}
      </View>
    );
  }

  return (
    <Screen
      scroll
      edges={["top"]}
      onRefresh={pull.onRefresh}
      refreshing={pull.refreshing}
      contentStyle={{ gap: space.lg, paddingBottom: space.xl }}
      footer={all.length ? <Button label={t("studio.newRoom")} icon="camera" onPress={() => router.push("/room/new")} /> : undefined}
    >
      <Text variant="title1" accessibilityRole="header" style={{ marginTop: space.md }}>
        {t("studio.title")}
      </Text>
      {all.length ? (
        <Segmented
          accessibilityLabel={t("studio.title")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "open", label: `${t("studio.inProgress")} · ${open.length}` },
            { value: "done", label: `${t("studio.finished")} · ${done.length}` },
          ]}
        />
      ) : null}
      {body}

      <Sheet visible={Boolean(menu)} onClose={() => setMenu(null)} title={menu?.name?.trim() || t("rooms.untitled")}>
        <ListGroup>
          <ListRow
            icon="edit-2"
            title={t("studio.rename")}
            onPress={() => {
              setError(null);
              setName(menu?.name ?? "");
              setRenaming(menu);
              setMenu(null);
            }}
          />
          <ListRow
            icon="share-2"
            title={t("studio.share")}
            onPress={() => {
              const room = menu;
              setMenu(null);
              if (room) router.push({ pathname: "/room/[projectId]/share", params: { projectId: room.id } } as Href);
            }}
          />
          <ListRow
            icon="trash-2"
            tone="danger"
            title={t("studio.delete")}
            onPress={() => {
              setError(null);
              setDeleting(menu);
              setMenu(null);
            }}
          />
        </ListGroup>
      </Sheet>

      <Sheet visible={Boolean(renaming)} onClose={() => !saving.busy && setRenaming(null)} title={t("studio.renameTitle")}>
        <TextField
          label={t("details.name")}
          value={name}
          onChangeText={(v) => {
            setName(v);
            setError(null);
          }}
          maxLength={200}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={rename}
          error={error}
        />
        <Button label={t("studio.renameSave")} onPress={rename} disabled={!name.trim()} loading={saving.busy} />
      </Sheet>

      <ConfirmSheet
        visible={Boolean(deleting)}
        title={t("studio.deleteTitle")}
        body={t("studio.deleteBody")}
        confirmLabel={t("studio.delete")}
        destructive
        loading={saving.busy}
        error={error}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </Screen>
  );
}
