import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { pushApi } from "@/api/endpoints/push";
import { getLanguage, t } from "@/i18n";
import { appVersion } from "@/lib/app-version";

/**
 * Push notifications on this phone (Phase 8): permission, the Android channels, and the
 * phone's Expo push token kept against whoever is signed in. Never on the web, a
 * simulator, or a build without an EAS project — there's no token to be had there, and
 * everything here then quietly does nothing.
 */

/** The token last registered, kept so signing out can drop it. */
const TOKEN_KEY = "hv.pushToken";

/**
 * What this run registered — account, token and language. Sent once per start (so the
 * server sees the phone is still in use, and keeps its newest ten), and again on a change.
 */
let registeredThisRun: string | null = null;

/** Android groups notifications by channel, and each can be turned off on its own. */
export const CHANNELS = {
  rooms: "rooms",
  points: "points",
  support: "support",
} as const;

export function pushSupported(): boolean {
  return Platform.OS !== "web" && Device.isDevice && Boolean(projectId());
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

/**
 * Android's channels, named in the current language. Made before any permission is
 * asked: on Android 13 and later the system prompt only appears once a channel exists.
 */
export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Promise.all([
    Notifications.setNotificationChannelAsync(CHANNELS.rooms, { name: t("notifications.channelRooms"), importance: Notifications.AndroidImportance.DEFAULT }),
    Notifications.setNotificationChannelAsync(CHANNELS.points, { name: t("notifications.channelPoints"), importance: Notifications.AndroidImportance.DEFAULT }),
    Notifications.setNotificationChannelAsync(CHANNELS.support, { name: t("notifications.channelSupport"), importance: Notifications.AndroidImportance.HIGH }),
  ]).catch(() => {});
}

export type PushPermission = "granted" | "ask" | "settings";

/** Whether notifications are allowed; may be asked for; or only Settings can turn them on. */
export async function pushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return "settings";
  try {
    const now = await Notifications.getPermissionsAsync();
    if (now.granted) return "granted";
    return now.canAskAgain ? "ask" : "settings";
  } catch {
    return "settings";
  }
}

/** The system prompt — only ever after the app has said why (NotificationAsk). */
export async function askForPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  await ensureChannels();
  try {
    const answer = await Notifications.requestPermissionsAsync();
    return answer.granted;
  } catch {
    return false;
  }
}

async function expoToken(): Promise<string | null> {
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    return data || null;
  } catch {
    return null;
  }
}

let ready = false;
const listeners = new Set<() => void>();
const setReady = (next: boolean) => {
  if (ready === next) return;
  ready = next;
  for (const listener of listeners) listener();
};

/** Whether this phone will be told about things (allowed, and its token registered). */
export function pushReady(): boolean {
  return ready;
}

export function subscribePushReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Keeps this phone's token against `userId` — only if notifications are already allowed;
 * never asks. Sent once a start, and again when the account, the token or the language
 * changes.
 */
export async function registerPush(userId: string): Promise<void> {
  if (!pushSupported() || (await pushPermission()) !== "granted") {
    setReady(false);
    return;
  }
  await ensureChannels();
  const token = await expoToken();
  if (!token) return;
  const locale = getLanguage();
  const pair = `${userId}|${token}|${locale}`;
  if (registeredThisRun === pair) {
    setReady(true);
    return;
  }
  try {
    await pushApi.register({ token, platform: Platform.OS === "ios" ? "IOS" : "ANDROID", locale, appVersion: appVersion().version });
    registeredThisRun = pair;
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
    setReady(true);
  } catch {
    // Tried again at the next start or sign-in.
  }
}

/** On signing out by choice, while the session still works: this phone stops being told. */
export async function unregisterPush(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  if (token) await pushApi.unregister(token).catch(() => {});
}

/** Whenever an account leaves this phone: its notifications go with it. */
export async function forgetPush(): Promise<void> {
  setReady(false);
  registeredThisRun = null;
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  if (Platform.OS === "web") return;
  await Promise.all([Notifications.dismissAllNotificationsAsync(), Notifications.setBadgeCountAsync(0)]).catch(() => {});
}
