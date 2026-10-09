import NetInfo from "@react-native-community/netinfo";
import { MutationCache, QueryCache, QueryClient, focusManager, onlineManager } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";

import { reportError } from "@/lib/crash-reports";

import { isApiError, isRetryable } from "./errors";

/** A failure that isn't the server's answer or a dropped connection is a fault in the app. */
const reportFault = (where: string) => (error: unknown) => {
  if (!isApiError(error)) reportError(error, where);
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: reportFault("query") }),
  mutationCache: new MutationCache({ onError: reportFault("mutation") }),
  defaultOptions: {
    queries: {
      // Patchy 4G: try twice more, but only when trying again could help.
      retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
      staleTime: 30_000,
    },
    mutations: {
      // Never silently repeat something that may have changed state (or spent money).
      retry: false,
    },
  },
});

/**
 * Tell React Query when the phone goes online/offline and when the app comes back to
 * the foreground, so data refreshes then. Call once from the root layout.
 */
export function connectQueryClientToApp(): () => void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
  );
  const sub = AppState.addEventListener("change", (status) => {
    if (Platform.OS !== "web") focusManager.setFocused(status === "active");
  });
  return () => sub.remove();
}
