import * as Application from "expo-application";
import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * "0.1.0" and the store build number, for the Account footer, support details and X5.
 * Read from the installed app itself: EAS numbers builds remotely, so app.json never
 * carries the build, and an update over the air never changes either.
 */
export function appVersion(): { version: string; build: string } {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "0.0.0";
  const build = Application.nativeBuildVersion ?? (Platform.OS === "web" ? "web" : "1");
  return { version, build };
}
