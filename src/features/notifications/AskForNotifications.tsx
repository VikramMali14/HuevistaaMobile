import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { useSession } from "@/auth/session";
import { ConfirmSheet } from "@/components/ui";
import { t, type MessageKey } from "@/i18n";

import { askForPush, pushPermission, pushSupported, registerPush } from "./notifications";

/** The moments notifications are offered — each when there's something to wait for. */
export type AskReason = "walls" | "image" | "voucher" | "support";

const ASKED_KEY = "hv.pushAsked";

const COPY: Record<AskReason, { title: MessageKey; body: MessageKey }> = {
  walls: { title: "notifications.askWallsTitle", body: "notifications.askWallsBody" },
  image: { title: "notifications.askImageTitle", body: "notifications.askImageBody" },
  voucher: { title: "notifications.askVoucherTitle", body: "notifications.askVoucherBody" },
  support: { title: "notifications.askSupportTitle", body: "notifications.askSupportBody" },
};

async function askedFor(): Promise<AskReason[]> {
  try {
    const kept = JSON.parse((await AsyncStorage.getItem(ASKED_KEY)) ?? "[]") as unknown;
    return Array.isArray(kept) ? (kept as AskReason[]) : [];
  } catch {
    return [];
  }
}

async function markAsked(reason: AskReason): Promise<void> {
  const before = await askedFor();
  await AsyncStorage.setItem(ASKED_KEY, JSON.stringify([...new Set([...before, reason])])).catch(() => {});
}

/**
 * X3 for notifications: when `when` turns true — something has started that takes a while —
 * says why first, and only then lets the phone ask. Never at first launch or sign-in; at
 * most once for each reason; not at all where notifications can't work, are already on,
 * or can only be turned on in Settings (S1 offers that).
 */
export function AskForNotifications({ reason, when }: { reason: AskReason; when: boolean }) {
  const { state } = useSession();
  // A real account only — never the developer's preview profile.
  const userId = state.status === "signedIn" && !state.preview ? state.profile.id : null;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!when || !pushSupported()) return;
    let alive = true;
    void (async () => {
      if ((await pushPermission()) !== "ask" || (await askedFor()).includes(reason)) return;
      if (alive) setOpen(true);
    })();
    return () => {
      alive = false;
    };
  }, [when, reason]);

  const close = () => {
    setOpen(false);
    void markAsked(reason);
  };

  return (
    <ConfirmSheet
      visible={open}
      title={t(COPY[reason].title)}
      body={t(COPY[reason].body)}
      confirmLabel={t("notifications.allow")}
      onConfirm={() => {
        close();
        void askForPush().then((granted) => {
          if (granted && userId) void registerPush(userId);
        });
      }}
      onCancel={close}
      testID="notifications-ask"
    />
  );
}
