import * as Linking from "expo-linking";

/**
 * The link that opened the app, fragment and all — routing never sees a fragment, and the
 * payment page's answer is one (D3). Its own module so tests can hand it a link: the
 * router's test helper replaces expo-linking with a copy of its own.
 */
export function useOpeningUrl(): string | null {
  return Linking.useLinkingURL();
}
