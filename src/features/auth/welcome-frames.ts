import type { ImageSourcePropType } from "react-native";

import roomOriginal from "../../../assets/images/welcome/room-original.jpg";
import roomSage from "../../../assets/images/welcome/room-sage.jpg";
import roomSlate from "../../../assets/images/welcome/room-slate.jpg";
import roomTerracotta from "../../../assets/images/welcome/room-terracotta.jpg";

/**
 * The Welcome screen's room (A2): the website's own paint-a-wall photo, painted by the
 * website's own engine (HueVistaFrontEnd lib/paint-room-frames.ts, shadow strength .85)
 * in its demo colours. Only the wall changes; the light and the shadows stay — the
 * product shown, not described.
 *
 * Demo names only, like the website's band: these are not catalogue shades and carry
 * no codes. Regenerate all four together if the photo or its mask changes.
 */
export interface WelcomeFrame {
  source: ImageSourcePropType;
  /** i18n key of the tag shown on the photo. */
  labelKey: "auth.welcome.wallToday" | "auth.welcome.sage" | "auth.welcome.terracotta" | "auth.welcome.slate";
  /** The demo colour, for the tag's dot. Null for the wall as photographed. */
  hex: string | null;
}

export const welcomeFrames: readonly WelcomeFrame[] = [
  { source: roomOriginal, labelKey: "auth.welcome.wallToday", hex: null },
  { source: roomSage, labelKey: "auth.welcome.sage", hex: "#7b8a72" },
  { source: roomTerracotta, labelKey: "auth.welcome.terracotta", hex: "#b96b48" },
  { source: roomSlate, labelKey: "auth.welcome.slate", hex: "#3e4a52" },
];
