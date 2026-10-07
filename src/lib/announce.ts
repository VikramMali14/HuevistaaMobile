import { AccessibilityInfo, Platform } from "react-native";

/**
 * Say a sentence to a screen reader — the outcome of a money action, say, shown in a banner
 * the reader's focus isn't on. iOS only: Android's TalkBack already reads the banner, which
 * is a live region; announcing it there too would say it twice.
 */
export function announce(message: string | null | undefined): void {
  if (!message || Platform.OS !== "ios") return;
  AccessibilityInfo.announceForAccessibility(message);
}
