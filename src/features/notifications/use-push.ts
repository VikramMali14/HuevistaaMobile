import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useRouter, type Href } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";

import type { SessionState } from "@/auth/session";
import { useLanguage } from "@/i18n/language";

import { pushReady, registerPush } from "./notifications";
import { invalidationsFor, pathFor, readPayload, type PushPayload } from "./push-routes";

/** The support chat on screen now: a reply to it appears in it, without a banner over it. */
let quietConversation: string | null = null;
export function setQuietConversation(id: string | null): void {
  quietConversation = id;
}

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const p = readPayload(notification.request.content.data);
      const quiet = p?.type === "SUPPORT_REPLY" && p.conversationId === quietConversation;
      return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: false, shouldSetBadge: false };
    },
  });
}

const signedInId = (state: SessionState) => (state.status === "signedIn" && !state.preview ? state.profile.id : null);

/**
 * Keeps this phone's push token against whoever is signed in — again after a switch of
 * account or language, a new token, or notifications being allowed in Settings.
 */
export function usePushRegistration(state: SessionState): void {
  const userId = signedInId(state);
  const language = useLanguage();

  useEffect(() => {
    if (userId) void registerPush(userId);
  }, [userId, language]);

  useEffect(() => {
    if (!userId || Platform.OS === "web") return;
    const token = Notifications.addPushTokenListener(() => void registerPush(userId));
    // Back from the phone's settings, perhaps with notifications now allowed.
    const app = AppState.addEventListener("change", (status) => {
      if (status === "active" && !pushReady()) void registerPush(userId);
    });
    return () => {
      token.remove();
      app.remove();
    };
  }, [userId]);
}

/** Taps already acted on, by notification — one is never opened twice. */
const handled = new Set<string>();

/** The tap waiting to be opened — kept outside React, so it outlives a remount of the screens. */
let waiting: { id: string; payload: PushPayload } | null = null;
const tapListeners = new Set<() => void>();
const subscribeTap = (listener: () => void) => {
  tapListeners.add(listener);
  return () => {
    tapListeners.delete(listener);
  };
};
const waitingTap = () => waiting;
function setWaiting(next: typeof waiting) {
  waiting = next;
  for (const listener of tapListeners) listener();
}

function take(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const id = response.notification.request.identifier;
  const payload = readPayload(response.notification.request.content.data);
  if (handled.has(id) || !payload) return;
  setWaiting({ id, payload });
}

/**
 * With the app open, a notification refreshes what it made stale. A tap — with the app
 * open, in the background or not running — opens its screen for the account it was sent
 * to; one for an account no longer signed in, or arriving signed out, is dropped.
 * `canNavigate`: the screens are up (not the update-needed screen).
 */
export function usePushObserver(state: SessionState, canNavigate: boolean): void {
  const queryClient = useQueryClient();
  const router = useRouter();
  const tap = useSyncExternalStore(subscribeTap, waitingTap, waitingTap);
  const userId = signedInId(state);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let alive = true;
    // Started by a tap: the response is waiting.
    void Notifications.getLastNotificationResponseAsync()
      .then((r) => alive && take(r))
      .catch(() => {});
    const responded = Notifications.addNotificationResponseReceivedListener(take);
    return () => {
      alive = false;
      responded.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || !userId) return;
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const p = readPayload(notification.request.content.data);
      if (!p || p.userId !== userId) return;
      for (const filter of invalidationsFor(p)) void queryClient.invalidateQueries(filter);
    });
    return () => received.remove();
  }, [queryClient, userId]);

  useEffect(() => {
    if (!tap || state.status === "loading" || state.status === "unreachable" || !canNavigate) return;
    handled.add(tap.id);
    setWaiting(null);
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    const path = pathFor(tap.payload);
    if (!path || tap.payload.userId !== userId) return;
    for (const filter of invalidationsFor(tap.payload)) void queryClient.invalidateQueries(filter);
    // After the first screen's own redirect has gone through, so this lands on top of home.
    // Not cancelled with the effect: clearing the tap just above re-runs it at once.
    setTimeout(() => router.push(path as Href), 0);
  }, [tap, state.status, userId, canNavigate, router, queryClient]);
}
