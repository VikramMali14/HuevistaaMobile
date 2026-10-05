import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { tokens } from "@/api/instance";
import { authApi } from "@/api/endpoints/auth";
import { isApiError } from "@/api/errors";
import { queryClient } from "@/api/query-client";
import type { AuthResponse, UserProfile, UserRole } from "@/api/types";

import { forgetRememberedRoute } from "./pending-route";
import { secureTokenStore } from "./token-store";

/** The profile is not secret; it is cached so the app can open offline (A1). */
const PROFILE_CACHE_KEY = "hv.profile";

export type SessionState =
  | { status: "loading" }
  /** Tokens exist but the server can't be reached and nothing is cached (A1). */
  | { status: "unreachable" }
  /**
   * `byChoice`: the person signed out themselves. Then no page is remembered for after the
   * next sign-in (A1) — the next person to sign in on this phone may be someone else.
   */
  | { status: "signedOut"; byChoice?: boolean }
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
  signOut(): Promise<void>;
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

function previewProfile(role: UserRole): UserProfile {
  return { id: "preview", name: "Preview", provider: "LOCAL", role, switchTo: null };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const signedIn = useCallback((profile: UserProfile) => {
    setState({ status: "signedIn", profile, preview: false });
  }, []);

  const forget = useCallback(async (byChoice = false) => {
    forgetRememberedRoute();
    await tokens.clear();
    queryClient.clear();
    await AsyncStorage.removeItem(PROFILE_CACHE_KEY).catch(() => {});
    setState({ status: "signedOut", byChoice });
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
        const profile = await authApi.profile();
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
        await tokens.setTokens({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
        });
        if (response.deviceToken) await secureTokenStore.writeDeviceToken(response.deviceToken);
        // The profile endpoint is the authoritative copy (it carries the first-run flags).
        const profile = await authApi.profile();
        await cacheProfile(profile);
        signedIn(profile);
        return profile;
      },

      async refreshProfile() {
        if (state.status !== "signedIn" || state.preview) return null;
        const profile = await authApi.profile();
        await cacheProfile(profile);
        signedIn(profile);
        return profile;
      },

      async updateProfile(profile) {
        if (state.status !== "signedIn" || state.preview) return;
        await cacheProfile(profile);
        signedIn(profile);
      },

      async signOut() {
        if (tokens.hasSession()) {
          // Best effort: revoke on the server, but sign out locally whatever happens.
          await authApi.logout().catch(() => {});
        }
        await forget(true);
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
    [state, forget, signedIn],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession() must be used inside <SessionProvider>");
  return value;
}
