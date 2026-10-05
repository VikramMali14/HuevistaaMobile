import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";

import { BackButton, Screen, Text } from "@/components/ui";
import { useTheme } from "@/theme";

export interface FormScreenProps {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  /** Pinned at the bottom, above the keyboard and the home indicator — the primary action. */
  footer?: ReactNode;
  back?: boolean;
  backFallback?: Href;
}

/**
 * The frame every form screen shares (sign-in, account details, a shop code): back
 * arrow, a title with an optional lead, the form, and the main button pinned in the
 * bottom third where a thumb reaches it.
 */
export function FormScreen({ title, lead, children, footer, back = true, backFallback }: FormScreenProps) {
  const { space } = useTheme();
  return (
    <Screen scroll footer={footer}>
      {back ? <BackButton fallback={backFallback} /> : <View style={{ height: space.xl }} />}
      <View style={{ gap: space.sm, marginTop: space.md, marginBottom: space.xl }}>
        <Text variant="title1" accessibilityRole="header">
          {title}
        </Text>
        {typeof lead === "string" ? <Text variant="lead">{lead}</Text> : lead}
      </View>
      <View style={{ gap: space.lg }}>{children}</View>
    </Screen>
  );
}
