import { useEffect, useState } from "react";
import { Animated, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/theme";

import { useReducedMotion } from "./use-reduced-motion";

/**
 * A grey stand-in the shape of what is coming, so nothing jumps when it arrives. It
 * breathes slowly; under "Reduce motion" it holds still.
 */
export function Skeleton({
  width = "100%",
  height = 16,
  radius,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius: r } = useTheme();
  const reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0.55));

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius ?? r.sm, backgroundColor: colors.surfaceSoft, opacity: pulse },
        style,
      ]}
    />
  );
}
