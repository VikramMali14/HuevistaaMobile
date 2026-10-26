import { View } from "react-native";

import { useTheme } from "@/theme";

/**
 * The HueVistaa mark: two paint chips bridged by a crossbar — an H, a pair of chips,
 * and a before/after split. Drawn from the same 64-unit grid as
 * HueVistaFrontEnd/public/brand/mark.svg (change both together):
 *
 *   left chip   M6 6H22V58H6Z     sky (`mark`)
 *   right chip  M42 6H58V58H42Z   cobalt (`markDeep`)
 *   crossbar    M22 27H42V37H22Z  sky (`mark`)
 */
export function BrandMark({ size = 48 }: { size?: number }) {
  const { colors } = useTheme();
  const u = size / 64;
  const box = (x: number, y: number, w: number, h: number, fill: string) => ({
    position: "absolute" as const,
    left: x * u,
    top: y * u,
    width: w * u,
    height: h * u,
    backgroundColor: fill,
  });

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="image"
      accessibilityLabel="HueVistaa"
    >
      <View style={box(6, 6, 16, 52, colors.mark)} />
      <View style={box(42, 6, 16, 52, colors.markDeep)} />
      <View style={box(22, 27, 20, 10, colors.mark)} />
    </View>
  );
}
