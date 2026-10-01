import { View } from "react-native";

import { useTheme } from "@/theme";

/**
 * The HueVistaa mark: two paint chips bridged by a crossbar — an H, a pair of chips,
 * and a before/after split. Drawn from the same 64-unit grid as
 * HueVistaFrontEnd/public/brand/mark.svg (change both together):
 *
 *   left chip   M6 6H22V58H6Z     solid
 *   right chip  M42 6H58V58H42Z   same colour at .42
 *   crossbar    M22 27H42V37H22Z  solid, never tinted
 */
export function BrandMark({ size = 48, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  const fill = color ?? colors.accentSoft;
  const u = size / 64;
  const box = (x: number, y: number, w: number, h: number, opacity = 1) => ({
    position: "absolute" as const,
    left: x * u,
    top: y * u,
    width: w * u,
    height: h * u,
    backgroundColor: fill,
    opacity,
  });

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="image"
      accessibilityLabel="HueVistaa"
    >
      <View style={box(6, 6, 16, 52)} />
      <View style={box(42, 6, 16, 52, 0.42)} />
      <View style={box(22, 27, 20, 10)} />
    </View>
  );
}
