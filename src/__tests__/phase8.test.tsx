/**
 * Phase 8 through the REAL route tree: the language (S1), the update-needed check (X5),
 * and push notifications — registering, taps, refreshing what one made stale, signing
 * out, and asking before the phone does (X3). Only the network, the secure store, the
 * phone's language and its notification centre are faked.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AppState, Linking } from "react-native";

import type { Conversation } from "@/api/endpoints/support";
import { queryClient } from "@/api/query-client";
import type { UserProfile } from "@/api/types";
import { forgetRememberedRoute } from "@/auth/pending-route";
import { forgetPush } from "@/features/notifications/notifications";
import { setLanguage } from "@/i18n";

const mockSecure: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecure[key] ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecure[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockSecure[key];
  }),
}));

const mockPhone = { language: "en", isDevice: true };
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: mockPhone.language, languageTag: mockPhone.language }] }));
jest.mock("expo-device", () => ({
  get isDevice() {
    return mockPhone.isDevice;
  },
}));

// The installed app's own version, as a store build reports it.
jest.mock("expo-application", () => ({ nativeApplicationVersion: "0.1.0", nativeBuildVersion: "7" }));

const mockAuth = { profile: jest.fn<Promise<UserProfile>, []>(), logout: jest.fn(async () => undefined) };
jest.mock("@/api/endpoints/auth", () => ({ authApi: mockAuth }));
jest.mock("@/api/endpoints/me", () => ({
  meApi: new Proxy({}, { get: () => () => new Promise<never>(() => {}) }),
}));
const mockPush = { register: jest.fn(async () => undefined), unregister: jest.fn(async () => undefined) };
jest.mock("@/api/endpoints/push", () => ({
  get pushApi() {
    return mockPush;
  },
}));
const mockVersions = { versions: jest.fn() };
jest.mock("@/api/endpoints/mobile-version", () => ({
  get mobileVersionApi() {
    return mockVersions;
  },
}));
const mockSupport = {
  conversations: jest.fn(async () => []),
  conversation: jest.fn<Promise<Conversation>, [string]>(),
  start: jest.fn(),
  send: jest.fn(),
  requestHuman: jest.fn(),
};
jest.mock("@/api/endpoints/support", () => ({
  get supportApi() {
    return mockSupport;
  },
}));

// The notification centre from jest.setup.ts, driven from here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const notifications = require("expo-notifications") as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getLastNotificationResponseAsync: jest.Mock;
  __emit: (kind: "received" | "response" | "token", event: unknown) => void;
};

const STORE = "https://apps.apple.com/app/id123";
const ist = (fromNow: number) => new Date(Date.now() + fromNow + 5.5 * 3600_000).toISOString().slice(0, 19);

function signedInAs(role: UserProfile["role"]) {
  mockSecure["hv.access"] = "access-0";
  mockSecure["hv.refresh"] = "refresh-0";
  mockAuth.profile.mockResolvedValue({ id: "u1", name: "Priya Sharma", provider: "LOCAL", role, phoneNumber: "+919876543210" });
}
const allowed = (granted: boolean, canAskAgain = true) => ({ granted, canAskAgain, status: granted ? "granted" : canAskAgain ? "undetermined" : "denied" });
const chat = (status: Conversation["status"] = "OPEN"): Conversation => ({
  id: "c1",
  channel: "IN_APP",
  status,
  subject: "My payment didn't go through",
  createdAt: ist(-60_000),
  updatedAt: ist(-60_000),
  messages: [{ id: "m1", sender: "USER", body: "My payment didn't go through", createdAt: ist(-60_000) }],
});
let tapId = 0;
const tap = (data: Record<string, string>) => ({
  actionIdentifier: "default",
  notification: { request: { identifier: `n${++tapId}`, content: { data } } },
});

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue();

beforeAll(() => {
  // An EAS project, as a real build has (app.json gains it from `eas init`).
  const config = Constants.expoConfig as { extra?: Record<string, unknown> };
  config.extra = { ...config.extra, eas: { projectId: "test-project" } };
});

beforeEach(async () => {
  for (const key of Object.keys(mockSecure)) delete mockSecure[key];
  mockPhone.language = "en";
  mockPhone.isDevice = true;
  mockAuth.profile.mockReset();
  mockAuth.logout.mockClear();
  mockPush.register.mockClear();
  mockPush.unregister.mockClear();
  mockVersions.versions.mockReset().mockResolvedValue({ android: null, ios: null });
  mockSupport.conversation.mockReset();
  notifications.getPermissionsAsync.mockClear().mockResolvedValue(allowed(false));
  notifications.requestPermissionsAsync.mockClear().mockResolvedValue(allowed(false));
  notifications.getLastNotificationResponseAsync.mockResolvedValue(null);
  openURL.mockClear();
  openSettings.mockClear();
  setLanguage("en");
  forgetRememberedRoute();
  queryClient.clear();
  await AsyncStorage.clear();
  await forgetPush();
});

const tick = (ms = 50) => act(async () => jest.advanceTimersByTime(ms));

// ── S1 · Language ─────────────────────────────────────────────────────────────

describe("S1 · Language", () => {
  it("follows the phone: Hindi when the phone is in Hindi", async () => {
    mockPhone.language = "hi";
    renderRouter("./app", { initialUrl: "/welcome" });
    await waitFor(() => expect(screen.getByText("मोबाइल नंबर से जारी रखें")).toBeTruthy());
  });

  it("switches language from Settings, comes back to Settings in it, and remembers it", async () => {
    signedInAs("CUSTOMER");
    renderRouter("./app", { initialUrl: "/settings" });
    await waitFor(() => expect(screen.getByTestId("settings-language")).toBeTruthy());
    expect(screen.getByText("Phone's language (English)")).toBeTruthy();
    fireEvent.press(screen.getByTestId("settings-language"));
    fireEvent.press(screen.getByTestId("language-hi"));
    await waitFor(() => expect(screen.getByText("सेटिंग्स")).toBeTruthy());
    expect(screen).toHavePathname("/settings");
    expect(await AsyncStorage.getItem("hv.language")).toBe("hi");
    // Back to following the phone.
    fireEvent.press(screen.getByTestId("settings-language"));
    fireEvent.press(screen.getByTestId("language-phone"));
    await waitFor(() => expect(screen.getByText("Settings")).toBeTruthy());
    expect(await AsyncStorage.getItem("hv.language")).toBeNull();
  });

  it("starts in the language chosen before, whatever the phone says", async () => {
    await AsyncStorage.setItem("hv.language", "hi");
    renderRouter("./app", { initialUrl: "/welcome" });
    await waitFor(() => expect(screen.getByText("मोबाइल नंबर से जारी रखें")).toBeTruthy());
  });
});

// ── X5 · Update needed ────────────────────────────────────────────────────────

describe("X5 · Update needed", () => {
  const answer = (minimumVersion: string) => ({ android: { minimumVersion, latestVersion: null, storeUrl: STORE }, ios: { minimumVersion, latestVersion: null, storeUrl: STORE } });

  it("shows in place of everything when this version is below the minimum, with the store", async () => {
    await AsyncStorage.setItem("hv.minVersion", JSON.stringify(answer("9.0.0")));
    renderRouter("./app", { initialUrl: "/welcome" });
    await waitFor(() => expect(screen.getByTestId("update-needed")).toBeTruthy());
    fireEvent.press(screen.getByTestId("update-open-store"));
    expect(openURL).toHaveBeenCalledWith(STORE);
  });

  // A raised minimum never stops someone part-way through a room or a board.
  it("keeps a fresh answer for the next start, and blocks nothing now", async () => {
    mockVersions.versions.mockResolvedValue(answer("9.0.0"));
    renderRouter("./app", { initialUrl: "/welcome" });
    await waitFor(() => expect(screen.getByText("Continue with mobile number")).toBeTruthy());
    expect(screen.queryByTestId("update-needed")).toBeNull();
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem("hv.minVersion")) ?? "{}")).toEqual(answer("9.0.0")));
  });

  it("blocks nothing when the check can't be made", async () => {
    mockVersions.versions.mockRejectedValue(new Error("offline"));
    renderRouter("./app", { initialUrl: "/welcome" });
    await waitFor(() => expect(screen.getByText("Continue with mobile number")).toBeTruthy());
    expect(screen.queryByTestId("update-needed")).toBeNull();
  });

  // The backend's iOS store link is empty until the app is listed.
  it("still blocks a retired version with no store link, naming the store instead", async () => {
    const noStore = { minimumVersion: "9.0.0", latestVersion: null, storeUrl: null };
    await AsyncStorage.setItem("hv.minVersion", JSON.stringify({ android: noStore, ios: noStore }));
    renderRouter("./app", { initialUrl: "/welcome" });
    await waitFor(() => expect(screen.getByTestId("update-needed")).toBeTruthy());
    expect(screen.getByText("Update HueVistaa from the App Store.")).toBeTruthy();
    expect(screen.queryByTestId("update-open-store")).toBeNull();
  });

  it("asks again on coming back from the background, and that answer decides", async () => {
    const appState = AppState.addEventListener as jest.Mock;
    const from = appState.mock.calls.length;
    const appGoes = (next: string) =>
      act(async () => {
        for (const [type, listener] of appState.mock.calls.slice(from)) if (type === "change") listener(next);
      });
    renderRouter("./app", { initialUrl: "/welcome" });
    await waitFor(() => expect(screen.getByText("Continue with mobile number")).toBeTruthy());
    mockVersions.versions.mockResolvedValue(answer("9.0.0"));
    // A glance away (a notification pulled down) is not a return.
    await appGoes("inactive");
    await appGoes("active");
    expect(screen.queryByTestId("update-needed")).toBeNull();
    await appGoes("background");
    await appGoes("active");
    await waitFor(() => expect(screen.getByTestId("update-needed")).toBeTruthy());
    expect(screen.getByTestId("update-open-store")).toBeTruthy();
  });
});

// ── Push notifications ────────────────────────────────────────────────────────

describe("Push notifications", () => {
  it("registers this phone for whoever is signed in, in their language — only once allowed", async () => {
    signedInAs("CUSTOMER");
    renderRouter("./app", { initialUrl: "/settings" });
    await waitFor(() => expect(screen.getByTestId("settings-language")).toBeTruthy());
    await tick();
    expect(mockPush.register).not.toHaveBeenCalled();
    // Allowed from Settings: asked there, then registered.
    notifications.requestPermissionsAsync.mockResolvedValue(allowed(true));
    notifications.getPermissionsAsync.mockResolvedValue(allowed(true));
    await waitFor(() => expect(screen.getByTestId("settings-notifications")).toHaveTextContent(/Off/));
    fireEvent.press(screen.getByTestId("settings-notifications"));
    await waitFor(() =>
      expect(mockPush.register).toHaveBeenCalledWith({ token: "ExponentPushToken[test-token]", platform: "IOS", locale: "en", appVersion: expect.any(String) }),
    );
    await waitFor(() => expect(screen.getByTestId("settings-notifications")).toHaveTextContent(/On/));
    fireEvent.press(screen.getByTestId("settings-notifications"));
    expect(openSettings).toHaveBeenCalled();
  });

  it("registers again in Hindi when the language changes", async () => {
    signedInAs("CUSTOMER");
    notifications.getPermissionsAsync.mockResolvedValue(allowed(true));
    renderRouter("./app", { initialUrl: "/settings" });
    await waitFor(() => expect(mockPush.register).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" })));
    fireEvent.press(screen.getByTestId("settings-language"));
    fireEvent.press(screen.getByTestId("language-hi"));
    await waitFor(() => expect(mockPush.register).toHaveBeenCalledWith(expect.objectContaining({ locale: "hi" })));
  });

  it("opens a tapped notification's screen for the account it was sent to, and drops one for another", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversation.mockResolvedValue(chat("NEEDS_HUMAN"));
    renderRouter("./app", { initialUrl: "/settings" });
    await waitFor(() => expect(screen.getByTestId("settings-language")).toBeTruthy());
    act(() => notifications.__emit("response", tap({ type: "SUPPORT_REPLY", userId: "someone-else", conversationId: "c1" })));
    await tick();
    expect(screen).toHavePathname("/settings");
    act(() => notifications.__emit("response", tap({ type: "SUPPORT_REPLY", userId: "u1", conversationId: "c1" })));
    await waitFor(() => expect(screen).toHavePathname("/help/c1"));
  });

  it("opens the screen a notification was tapped for when it started the app", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversation.mockResolvedValue(chat("NEEDS_HUMAN"));
    notifications.getLastNotificationResponseAsync.mockResolvedValue(tap({ type: "SUPPORT_REPLY", userId: "u1", conversationId: "c1" }));
    renderRouter("./app", { initialUrl: "/" });
    await waitFor(() => expect(screen).toHavePathname("/help/c1"));
  });

  it("with the app open, refreshes what a notification made stale", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversation.mockResolvedValue(chat("NEEDS_HUMAN"));
    renderRouter("./app", { initialUrl: "/help/c1" });
    await waitFor(() => expect(screen.getByTestId("chat-messages")).toBeTruthy());
    const before = mockSupport.conversation.mock.calls.length;
    mockSupport.conversation.mockResolvedValue({
      ...chat("NEEDS_HUMAN"),
      messages: [...chat().messages, { id: "m2", sender: "AGENT", body: "Hi, Anil from the team here.", createdAt: ist(0) }],
    });
    act(() => notifications.__emit("received", { request: { identifier: "r1", content: { data: { type: "SUPPORT_REPLY", userId: "u1", conversationId: "c1" } } } }));
    await waitFor(() => expect(screen.getByText("Hi, Anil from the team here.")).toBeTruthy());
    expect(mockSupport.conversation.mock.calls.length).toBeGreaterThan(before);
  });

  it("drops this phone's token on signing out, before telling the server", async () => {
    signedInAs("CUSTOMER");
    notifications.getPermissionsAsync.mockResolvedValue(allowed(true));
    renderRouter("./app", { initialUrl: "/settings" });
    await waitFor(() => expect(mockPush.register).toHaveBeenCalled());
    fireEvent.press(screen.getByText("Sign out"));
    await waitFor(() => expect(screen.getAllByText("Sign out").length).toBeGreaterThan(1));
    fireEvent.press(screen.getAllByText("Sign out").at(-1)!);
    await waitFor(() => expect(mockAuth.logout).toHaveBeenCalled());
    expect(mockPush.unregister).toHaveBeenCalledWith("ExponentPushToken[test-token]");
    expect(mockPush.unregister.mock.invocationCallOrder[0]).toBeLessThan(mockAuth.logout.mock.invocationCallOrder[0]!);
  });

  // X3: why first, then the phone's own question — once, and only at a moment that waits.
  it("asks before the phone does when the team takes a chat, and only once", async () => {
    signedInAs("CUSTOMER");
    mockSupport.conversation.mockResolvedValue(chat("NEEDS_HUMAN"));
    const first = renderRouter("./app", { initialUrl: "/help/c1" });
    await waitFor(() => expect(screen.getByText("Tell you when our team replies?")).toBeTruthy());
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("notifications-ask-confirm"));
    await waitFor(() => expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1));
    first.unmount();
    renderRouter("./app", { initialUrl: "/help/c1" });
    await waitFor(() => expect(screen.getByTestId("chat-messages")).toBeTruthy());
    await tick(500);
    expect(screen.queryByText("Tell you when our team replies?")).toBeNull();
  });

  it("never asks where notifications can't work", async () => {
    mockPhone.isDevice = false;
    signedInAs("CUSTOMER");
    mockSupport.conversation.mockResolvedValue(chat("NEEDS_HUMAN"));
    renderRouter("./app", { initialUrl: "/help/c1" });
    await waitFor(() => expect(screen.getByTestId("chat-messages")).toBeTruthy());
    await tick(500);
    expect(screen.queryByText("Tell you when our team replies?")).toBeNull();
    expect(mockPush.register).not.toHaveBeenCalled();
  });
});
