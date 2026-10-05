import { useEffect, type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

export interface ZoomViewProps {
  children: ReactNode;
  /** Largest zoom, 1 = none. */
  maxScale?: number;
  /** Changes put the view back to 1x (a new photo, leaving a mode). */
  resetKey?: string | number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Two fingers pinch to zoom and drag to move; one finger is left to whatever is
 * underneath (tap a wall, draw a mask). Runs on the UI thread, so a pan stays at the
 * screen's frame rate however busy the JS thread is (docs/04 C11: 60 fps pan and zoom).
 */
export function ZoomView({ children, maxScale = 4, resetKey, style }: ZoomViewProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  useEffect(() => {
    scale.set(withTiming(1));
    savedScale.set(1);
    x.set(withTiming(0));
    y.set(withTiming(0));
    savedX.set(0);
    savedY.set(0);
  }, [resetKey, scale, savedScale, x, y, savedX, savedY]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.set(Math.min(maxScale, Math.max(1, savedScale.get() * e.scale)));
    })
    .onEnd(() => {
      savedScale.set(scale.get());
      if (scale.get() <= 1.01) {
        scale.set(withTiming(1));
        savedScale.set(1);
        x.set(withTiming(0));
        y.set(withTiming(0));
        savedX.set(0);
        savedY.set(0);
      }
    });

  const pan = Gesture.Pan()
    .minPointers(2)
    .onUpdate((e) => {
      x.set(savedX.get() + e.translationX);
      y.set(savedY.get() + e.translationY);
    })
    .onEnd(() => {
      savedX.set(x.get());
      savedY.set(y.get());
    });

  const moved = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
      <Animated.View style={[styles.clip, style]} collapsable={false}>
        <Animated.View style={[styles.fill, moved]}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  clip: { flex: 1, overflow: "hidden" },
  fill: { flex: 1 },
});
