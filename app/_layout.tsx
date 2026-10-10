// Import each weight by its own path: the package root pulls in all 18 Inter files.
// These are the four weights the website uses (400 / 500 / 600 / 700).
import { InstrumentSerif_400Regular_Italic } from "@expo-google-fonts/instrument-serif/400Regular_Italic";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { connectQueryClientToApp, queryClient } from "@/api/query-client";
import { SessionProvider, useSession } from "@/auth/session";
import { ErrorState, Screen, ToastProvider } from "@/components/ui";
import { loadVersionGate, useVersionGate, watchVersionGate } from "@/features/app-update/min-version";
import { UpdateNeeded } from "@/features/app-update/UpdateNeeded";
import { usePushObserver, usePushRegistration } from "@/features/notifications/use-push";
import { t } from "@/i18n";
import { loadLanguage, useLanguage } from "@/i18n/language";
import { reportError, setCrashUser, startCrashReports } from "@/lib/crash-reports";
import { useTheme } from "@/theme";

// A1: keep the native splash up until fonts are in and the session is known.
void SplashScreen.preventAutoHideAsync();
// Before anything can go wrong (off without a DSN — see crash-reports.ts).
startCrashReports();

/**
 * A screen that throws while drawing: reported, then the way back — never a white page.
 * Expo Router shows this in place of the route that broke.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportError(error, "screen"), [error]);
  return (
    <Screen>
      <ErrorState message={t("errors.screenBroke")} onRetry={() => void retry()} />
    </Screen>
  );
}

/** Never hold the splash longer than this; app/index.tsx then says "Still connecting…". */
const SPLASH_MAX_MS = 8_000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    InstrumentSerif_400Regular_Italic,
  });

  // Read from the phone before anything is drawn: the language, so no screen shows in the
  // wrong one, and X5's last answer (never the network — see min-version.ts).
  const [bootReady, setBootReady] = useState(false);
  useEffect(() => {
    void Promise.all([loadLanguage(), loadVersionGate()]).finally(() => setBootReady(true));
  }, []);

  useEffect(() => connectQueryClientToApp(), []);
  // X5 asked again on every return from the background.
  useEffect(() => watchVersionGate(), []);

  return (
    // Pinch-to-zoom in the studio (ZoomView) needs the gesture root at the very top.
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <ToastProvider>
              <Root ready={(fontsLoaded || Boolean(fontError)) && bootReady} />
            </ToastProvider>
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root({ ready }: { ready: boolean }) {
  const { state } = useSession();
  const { colors, scheme } = useTheme();
  const language = useLanguage();
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const gate = useVersionGate();
  const blocked = ready && gate.blocked;

  usePushRegistration(state);
  usePushObserver(state, ready && !blocked);

  const userId = state.status === "signedIn" && !state.preview ? state.profile.id : null;
  useEffect(() => setCrashUser(userId), [userId]);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedTooLong(true), SPLASH_MAX_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.bg);
  }, [colors.bg]);

  const canShow = ready && (state.status !== "loading" || waitedTooLong);
  useEffect(() => {
    if (canShow) void SplashScreen.hideAsync();
  }, [canShow]);

  if (!ready) return null;
  if (blocked) return <UpdateNeeded storeUrl={gate.storeUrl} />;

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {/* A new language remounts every screen: they read their strings as they draw, and
          the navigator keeps screens from drawing again on their own. The session, the
          cached data and the toasts sit above and carry on. */}
      <Stack
        key={language}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
