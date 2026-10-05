import { useEffect, type ReactNode } from "react";
import { StyleSheet, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
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
 * How far the content may move at `scale` and stay over the view: the zoomed picture's
 * overhang on each side. Nothing at 1x, so an unzoomed photo can't be dragged away.
 */
export function panLimit(size: number, scale: number): number {
  "worklet";
  return Math.max(0, (size * (scale - 1)) / 2);
}

function clamp(value: number, limit: number): number {
  "worklet";
  return Math.min(limit, Math.max(-limit, value));
}

/**
 * Two fingers pinch to zoom and drag to move; one finger is left to whatever is
 * underneath (tap a wall, draw a mask). Zoom stays centred on the fingers, and the picture
 * can't be pushed off the screen. Runs on the UI thread, so a pan stays at the screen's
 * frame rate however busy the JS thread is (docs/04 C11: 60 fps pan and zoom).
 */
export function ZoomView({ children, maxScale = 4, resetKey, style }: ZoomViewProps) {
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  /** The pinch's starting point: scale, offset, and where the fingers were (from the centre). */
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const focusX = useSharedValue(0);
  const focusY = useSharedValue(0);
  const pinching = useSharedValue(false);
  /** The two-finger drag's starting offset; re-taken after a pinch so it doesn't jump. */
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const rebase = useSharedValue(false);

  useEffect(() => {
    scale.set(withTiming(1));
    x.set(withTiming(0));
    y.set(withTiming(0));
  }, [resetKey, scale, x, y]);

  // Zoom and two-finger movement together: the point that was under the fingers when the
  // pinch began stays under them as they spread and move.
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      pinching.set(true);
      startScale.set(scale.get());
      startX.set(x.get());
      startY.set(y.get());
      focusX.set(e.focalX - width.get() / 2);
      focusY.set(e.focalY - height.get() / 2);
    })
    .onUpdate((e) => {
      const next = Math.min(maxScale, Math.max(1, startScale.get() * e.scale));
      const k = next / startScale.get();
      const fx = e.focalX - width.get() / 2;
      const fy = e.focalY - height.get() / 2;
      x.set(clamp(fx - k * (focusX.get() - startX.get()), panLimit(width.get(), next)));
      y.set(clamp(fy - k * (focusY.get() - startY.get()), panLimit(height.get(), next)));
      scale.set(next);
    })
    .onEnd(() => {
      pinching.set(false);
      rebase.set(true);
      if (scale.get() <= 1.01) {
        scale.set(withTiming(1));
        x.set(withTiming(0));
        y.set(withTiming(0));
      }
    });

  // A two-finger drag with no pinch in it.
  const pan = Gesture.Pan()
    .minPointers(2)
    .onStart(() => {
      panX.set(x.get());
      panY.set(y.get());
      rebase.set(false);
    })
    .onUpdate((e) => {
      if (pinching.get()) return;
      if (rebase.get()) {
        panX.set(x.get() - e.translationX);
        panY.set(y.get() - e.translationY);
        rebase.set(false);
      }
      x.set(clamp(panX.get() + e.translationX, panLimit(width.get(), scale.get())));
      y.set(clamp(panY.get() + e.translationY, panLimit(height.get(), scale.get())));
    });

  const moved = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  const measure = (e: LayoutChangeEvent) => {
    width.set(e.nativeEvent.layout.width);
    height.set(e.nativeEvent.layout.height);
  };

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
      <Animated.View style={[styles.clip, style]} collapsable={false} onLayout={measure}>
        <Animated.View style={[styles.fill, moved]}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  clip: { flex: 1, overflow: "hidden" },
  fill: { flex: 1 },
});
