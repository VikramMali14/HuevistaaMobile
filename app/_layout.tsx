// Import each weight by its own path: the package root pulls in all 18 Inter files.
// These are the four weights the website uses (400 / 500 / 600 / 700).
import { InstrumentSerif_400Regular_Italic } from "@expo-google-fonts/instrument-serif/400Regular_Italic";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { connectQueryClientToApp, queryClient } from "@/api/query-client";
import { SessionProvider, useSession } from "@/auth/session";
import { ToastProvider } from "@/components/ui";
import { useTheme } from "@/theme";

// A1: keep the native splash up until fonts are in and the session is known.
void SplashScreen.preventAutoHideAsync();

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

  useEffect(() => connectQueryClientToApp(), []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ToastProvider>
            <Root ready={fontsLoaded || Boolean(fontError)} />
          </ToastProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function Root({ ready }: { ready: boolean }) {
  const { state } = useSession();
  const { colors, scheme } = useTheme();
  const [waitedTooLong, setWaitedTooLong] = useState(false);

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

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
        }}
      />
    </>
  );
}
