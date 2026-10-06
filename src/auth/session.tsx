import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { tokens } from "@/api/instance";
import { authApi } from "@/api/endpoints/auth";
import { isApiError } from "@/api/errors";
import { queryClient } from "@/api/query-client";
import { resetMadeBoards } from "@/features/boards/made-boards";
import { resetPayments } from "@/features/payments/payments";
import { resetPending } from "@/features/payments/pending-payment";
import { clearStudioCache } from "@/features/studio/engine/texture-loader";
import { resetPaintStore, resetRecentShades } from "@/features/studio/paint-store";
import { clearUpload } from "@/features/studio/photo-upload";
import { resetTrays } from "@/features/studio/tray-store";
import type { AuthResponse, UserProfile, UserRole } from "@/api/types";

import { forgetRememberedRoute } from "./pending-route";
import { secureTokenStore } from "./token-store";

/** The profile is not secret; it is cached so the app can open offline (A1). */
const PROFILE_CACHE_KEY = "hv.profile";
/**
 * The id of an account whose first run ended on this phone while POST /welcome/seen had
 * not got through. Sent again at the next start, so a lost request does not ask the
 * role question a second time.
 */
const WELCOME_SEEN_PENDING_KEY = "hv.welcomeSeenPending";
/** Sign-out never waits longer than this for the server to hear about it. */
const LOGOUT_WAIT_MS = 3000;
/** features/catalogue/use-catalogue.ts CATALOGUE_CACHE_KEY (not imported: it imports this file). */
const CATALOGUE_CACHE_KEY = "hv.catalogue";

/**
 * Everything kept for one account: the screens' data, the catalogue copy (a shop
 * customer's is limited to their shop), the studio's colours and trays, the boards made
 * here, an unpaid order, and the pictures. (A payment that went through and is not yet
 * confirmed stays: the money has left — it is shown to its own account only.) Dropped on sign-out AND when a
 * sign-in brings a different profile (S10, C5's switch back), so one profile's rooms
 * never show under the other's name.
 */
async function forgetAccountData(): Promise<void> {
  queryClient.clear();
  resetPaintStore();
  resetTrays();
  resetPayments();
  clearUpload();
  clearStudioCache();
  await Promise.all([resetRecentShades(), resetMadeBoards(), resetPending()]);
  // The catalogue copy, which rooms open on Paint, and the board trays (Phase 3 studio).
  await AsyncStorage.multiRemove([CATALOGUE_CACHE_KEY, "hv.paintedRooms", "hv.boardTrays", "hv.askedShop"]).catch(() => {});
  try {
    await Promise.all([Image.clearMemoryCache(), Image.clearDiskCache()]);
  } catch {
    // Not every platform keeps one; nothing to clear then.
  }
}

export type SessionState =
  | { status: "loading" }
  /** Tokens exist but the server can't be reached and nothing is cached (A1). */
  | { status: "unreachable" }
  /**
   * `byChoice`: the person signed out themselves. Then no page is remembered for after the
   * next sign-in (A1) — the next person to sign in on this phone may be someone else.
   */
  | {
      status: "signedOut";
      byChoice?: boolean;
      /** Where the guards send this sign-out instead of Welcome (e.g. A5 after a password change). */
      landing?: string;
    }
  | { status: "signedIn"; profile: UserProfile; preview: boolean };

export interface SessionValue {
  state: SessionState;
  /** The profile when signed in, else null. */
  profile: UserProfile | null;
  /** Save the tokens from any sign-in answer and load the profile. */
  completeSignIn(response: AuthResponse): Promise<UserProfile>;
  /** Reload the profile after something changed it (name, role, verification…). */
  refreshProfile(): Promise<UserProfile | null>;
  /** Use a profile the server just returned (PATCH /profile, /welcome/seen) without another fetch. */
  updateProfile(profile: UserProfile): Promise<void>;
  /**
   * The first run is over (A10/A11). Recorded on this phone at once; if the server does
   * not hear about it, it is sent again at the next start — and this throws, for a caller
   * that needs to know.
   */
  markWelcomeSeen(): Promise<UserProfile>;
  /**
   * Sign out on this phone. `serverAlreadyKnows`: the backend has just ended every session
   * itself (a password change, a deleted account), so it is not told again. `landing`:
   * where to go instead of Welcome.
   */
  signOut(options?: { serverAlreadyKnows?: boolean; landing?: string }): Promise<void>;
  /** Try the start-up restore again (from the "can't reach" state). */
  retry(): void;
  /**
   * Development only: pretend to be signed in as `role`, without a backend, to walk
   * through the screens. Does nothing in a release build.
   */
  previewAs(role: UserRole | null): void;
}

const SessionContext = createContext<SessionValue | null>(null);

async function cacheProfile(profile: UserProfile) {
  await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)).catch(() => {});
}

async function readCachedProfile(): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

/**
 * At start-up: if this account's first run ended here but the server never heard, say
 * so again now. Offline again → treat it as over anyway; the next start retries.
 */
async function finishPendingWelcome(profile: UserProfile): Promise<UserProfile> {
  if (!profile.welcomePending) return profile;
  const pendingFor = await AsyncStorage.getItem(WELCOME_SEEN_PENDING_KEY).catch(() => null);
  if (pendingFor !== profile.id) return profile;
  try {
    const fresh = await authApi.welcomeSeen();
    await AsyncStorage.removeItem(WELCOME_SEEN_PENDING_KEY).catch(() => {});
    return fresh;
  } catch {
    return { ...profile, welcomePending: false };
  }
}

function previewProfile(role: UserRole): UserProfile {
  return { id: "preview", name: "Preview", provider: "LOCAL", role, switchTo: null };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const signedIn = useCallback((profile: UserProfile) => {
    setState({ status: "signedIn", profile, preview: false });
  }, []);

  /**
   * A newer copy of the SAME account, applied only if that account is still signed in —
   * an answer that lands after a sign-out (or a switch to another profile) is dropped,
   * instead of bringing the old session back on screen.
   */
  const signedInId = useRef<string | null>(null);
  useEffect(() => {
    signedInId.current = state.status === "signedIn" && !state.preview ? state.profile.id : null;
  }, [state]);

  const applyProfile = useCallback(async (profile: UserProfile) => {
    if (!tokens.hasSession() || signedInId.current !== profile.id) return;
    setState((prev) =>
      prev.status === "signedIn" && !prev.preview && prev.profile.id === profile.id
        ? { status: "signedIn", profile, preview: false }
        : prev,
    );
    await cacheProfile(profile);
  }, []);

  const forget = useCallback(async (byChoice = false, landing?: string) => {
    forgetRememberedRoute();
    await tokens.clear();
    await forgetAccountData();
    await AsyncStorage.multiRemove([PROFILE_CACHE_KEY, WELCOME_SEEN_PENDING_KEY]).catch(() => {});
    setState({ status: "signedOut", byChoice, ...(landing ? { landing } : {}) });
  }, []);

  // A1: restore the saved session.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await tokens.load();
      if (!tokens.hasSession()) {
        if (!cancelled) setState({ status: "signedOut" });
        return;
      }
      try {
        const profile = await finishPendingWelcome(await authApi.profile());
        await cacheProfile(profile);
        if (!cancelled) signedIn(profile);
      } catch (err) {
        if (cancelled) return;
        if (!tokens.hasSession() || (isApiError(err) && err.status === 401)) {
          // The refresh token was refused — the session is over.
          await forget();
          return;
        }
        // Offline or the server is down: never sign someone out for that.
        const cached = await readCachedProfile();
        setState(cached ? { status: "signedIn", profile: cached, preview: false } : { status: "unreachable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, forget, signedIn]);

  // X4: the backend refused the refresh token mid-session.
  useEffect(() => tokens.onSessionEnded(() => void forget()), [forget]);

  const value = useMemo<SessionValue>(
    () => ({
      state,
      profile: state.status === "signedIn" ? state.profile : null,

      async completeSignIn(response) {
        if (!response.accessToken || !response.refreshToken) {
          throw new Error("completeSignIn() needs an answer that carries tokens");
        }
        // Signed in already: this is a switch to another profile (S10, C5).
        const previousId = state.status === "signedIn" && !state.preview ? state.profile.id : null;
        await tokens.setTokens({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
        });
        if (response.deviceToken) await secureTokenStore.writeDeviceToken(response.deviceToken);
        // The profile endpoint is the authoritative copy (it carries the first-run flags).
        let profile: UserProfile;
        try {
          profile = await authApi.profile();
        } catch (err) {
          // Never leave tokens saved behind a screen that says "signed out": the next
          // start would sign this person in without them knowing. They try again.
          // Mid-switch, the old profile's session was handed over for the new one, so
          // there is nothing left to stay signed in with: say so, rather than keep the
          // old profile on screen with no session behind it.
          if (previousId) await forget();
          else await tokens.clear();
          throw err;
        }
        if (previousId && previousId !== profile.id) await forgetAccountData();
        await cacheProfile(profile);
        signedIn(profile);
        return profile;
      },

      async refreshProfile() {
        if (state.status !== "signedIn" || state.preview) return null;
        const profile = await authApi.profile();
        await applyProfile(profile);
        return profile;
      },

      async updateProfile(profile) {
        if (state.status !== "signedIn" || state.preview) return;
        await applyProfile(profile);
      },

      async markWelcomeSeen() {
        if (state.status !== "signedIn") throw new Error("markWelcomeSeen() needs a signed-in session");
        const { profile } = state;
        if (state.preview) return profile;
        await AsyncStorage.setItem(WELCOME_SEEN_PENDING_KEY, profile.id).catch(() => {});
        try {
          const fresh = await authApi.welcomeSeen();
          await AsyncStorage.removeItem(WELCOME_SEEN_PENDING_KEY).catch(() => {});
          await applyProfile(fresh);
          return fresh;
        } catch (err) {
          // Over on this phone regardless; the next start sends it again.
          await applyProfile({ ...profile, welcomePending: false });
          throw err;
        }
      },

      async signOut(options) {
        if (tokens.hasSession() && !options?.serverAlreadyKnows) {
          // Best effort: tell the server, but never keep someone waiting on a dead
          // connection — signing out locally is what they asked for.
          await Promise.race([
            authApi.logout().catch(() => {}),
            new Promise((resolve) => setTimeout(resolve, LOGOUT_WAIT_MS)),
          ]);
        }
        await forget(true, options?.landing);
      },

      retry() {
        setState({ status: "loading" });
        setAttempt((n) => n + 1);
      },

      previewAs(role) {
        if (!__DEV__) return;
        setState(
          role
            ? { status: "signedIn", profile: previewProfile(role), preview: true }
            : { status: "signedOut", byChoice: true },
        );
      },
    }),
    [state, applyProfile, forget, signedIn],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession() must be used inside <SessionProvider>");
  return value;
}
