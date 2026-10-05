import Constants from "expo-constants";
import { Platform } from "react-native";

/** "0.1.0" and the store build number, for the Account footer and support details. */
export function appVersion(): { version: string; build: string } {
  const config = Constants.expoConfig;
  const version = config?.version ?? "0.0.0";
  const build =
    Platform.OS === "ios"
      ? (config?.ios?.buildNumber ?? "1")
      : String(config?.android?.versionCode ?? (Platform.OS === "web" ? "web" : "1"));
  return { version, build };
}
