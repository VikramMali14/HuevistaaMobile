import Feather from "@expo/vector-icons/Feather";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { hairline, motion, useTheme } from "@/theme";

import { Text } from "./Text";
import { useReducedMotion } from "./use-reduced-motion";

export type ToastTone = "info" | "success" | "error";

interface ToastValue {
  /**
   * A short message at the top of the screen for a few seconds — clear of the main
   * button, which every screen pins at the bottom.
   */
  show(message: string, tone?: ToastTone): void;
}

const ToastContext = createContext<ToastValue | null>(null);

const SHOW_MS = 3500;

/** Mounted once in the root layout; any screen calls useToast().show(…). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; tone: ToastTone } | null>(null);
  const counter = useRef(0);

  const show = useCallback((message: string, tone: ToastTone = "info") => {
    counter.current += 1;
    setToast({ id: counter.current, message, tone });
  }, []);

  const value = useMemo(() => ({ show }), [show]);
  const hide = useCallback(() => setToast(null), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? <ToastView key={toast.id} {...toast} onDone={hide} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ message, tone, onDone }: { message: string; tone: ToastTone; onDone: () => void }) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  // An animated value is created once and kept for the toast's life.
  const [appear] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animate = (to: number) =>
      Animated.timing(appear, { toValue: to, duration: reduced ? 0 : motion.normal, useNativeDriver: true });
    animate(1).start();
    const timer = setTimeout(() => animate(0).start(() => onDone()), SHOW_MS);
    return () => clearTimeout(timer);
  }, [appear, onDone, reduced]);

  const icon = tone === "success" ? "check-circle" : tone === "error" ? "alert-circle" : "info";
  const iconColor = tone === "success" ? colors.successText : tone === "error" ? colors.dangerText : colors.fgSoft;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.toast,
          {
            marginTop: insets.top + 12,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceSoft,
            borderColor: colors.ruleStrong,
            opacity: appear,
            transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
          },
        ]}
      >
        <Feather name={icon} size={18} color={iconColor} />
        <Text variant="small" style={styles.text}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast() must be used inside <ToastProvider>");
  return value;
}

const styles = StyleSheet.create({
  layer: { justifyContent: "flex-start", alignItems: "center", paddingHorizontal: 20 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: hairline,
    maxWidth: 480,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  text: { flexShrink: 1 },
});
