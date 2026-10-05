import Feather from "@expo/vector-icons/Feather";
import { Image, type ImageContentFit } from "expo-image";
import { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { mediaSource } from "@/api/media";
import { useTheme } from "@/theme";

/**
 * A picture the backend serves — a room photo, an AI image. Sits on a soft surface
 * while it loads, and shows a quiet image icon rather than a broken box if it fails.
 */
export function RemoteImage({
  url,
  style,
  contentFit = "cover",
  accessibilityLabel,
}: {
  url: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const source = mediaSource(url);
  return (
    <View
      style={[styles.box, { backgroundColor: colors.surfaceSoft }, style]}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? "image" : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {source && !failed ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          transition={150}
          onError={() => setFailed(true)}
        />
      ) : (
        <Feather name="image" size={22} color={colors.fgMute} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
});
