import { useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect } from "react";
import { AppState } from "react-native";

/**
 * The camera's permission, read again whenever it may have changed behind the screen's
 * back: on coming back to the app (from the phone's Settings, where it is turned on once
 * refused) and on coming back to the screen (tabs stay mounted, so the first answer would
 * otherwise stand for good). expo-camera's own hook reads it once, on mount.
 */
export function useCameraPermission() {
  const [permission, request, get] = useCameraPermissions();
  const reread = useCallback(() => {
    void get().catch(() => {});
  }, [get]);

  useFocusEffect(reread);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") reread();
    });
    return () => sub.remove();
  }, [reread]);

  return [permission, request] as const;
}
