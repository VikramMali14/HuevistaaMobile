import Feather from "@expo/vector-icons/Feather";
import { CameraView } from "expo-camera";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton, Banner, Button, IconButton, Screen, Text } from "@/components/ui";
import { useBalance } from "@/features/account/use-balance";
import { NextStepCard } from "@/features/home/NextStepCard";
import { useLibrary } from "@/features/library/use-library";
import { clearUpload, preparePhoto, startUpload } from "@/features/studio/photo-upload";
import { t } from "@/i18n";
import { useCameraPermission } from "@/lib/use-camera-permission";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

interface Shot {
  uri: string;
  width: number;
  height: number;
}

/**
 * C6 · Add photo (step 1). Spec: docs/04-screens-customer.md — C6.
 *
 * With no room to spend, the next-step card instead of the camera. Otherwise the
 * viewfinder (or the gallery), a preview to keep or retake, and then the photo is shrunk
 * on the phone and its upload starts — C7 opens at once and names the room meanwhile.
 * A shade passed from C19 (`shade`, `brand`) rides along to the paint step.
 */
export default function AddPhoto() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, space } = useTheme();
  const params = useLocalSearchParams<{ shade?: string; brand?: string }>();
  const balance = useBalance();
  const library = useLibrary();
  const [permission, requestPermission] = useCameraPermission();
  const camera = useRef<CameraView>(null);
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [cameraReady, setCameraReady] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const taking = useSubmit();
  const preparing = useSubmit();

  // Android's back from the preview goes back to the camera, as Retake does.
  useEffect(() => {
    if (!shot) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (preparing.busy) return true;
      setShot(null);
      setError(null);
      return true;
    });
    return () => sub.remove();
  }, [shot, preparing.busy]);

  const pick = async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, exif: false });
      const asset = result.canceled ? null : result.assets?.[0];
      if (asset) setShot({ uri: asset.uri, width: asset.width, height: asset.height });
    } catch {
      setError(t("addPhoto.unreadable"));
    }
  };

  const take = () =>
    void taking.run(async () => {
      setError(null);
      try {
        const photo = await camera.current?.takePictureAsync({ quality: 0.9 });
        if (photo) setShot({ uri: photo.uri, width: photo.width, height: photo.height });
      } catch {
        setError(t("addPhoto.unreadable"));
      }
    });

  const use = () => {
    if (!shot) return;
    void preparing.run(async () => {
      setError(null);
      try {
        clearUpload();
        startUpload(await preparePhoto(shot.uri, shot.width, shot.height));
        router.push({ pathname: "/room/details", params: { shade: params.shade, brand: params.brand } });
      } catch {
        setError(t("addPhoto.unreadable"));
      }
    });
  };

  // No room to spend: say what to do instead of opening the camera.
  if (balance.nextStep === "exhausted" || balance.nextStep === "missing") {
    return (
      <Screen scroll contentStyle={{ gap: space.lg }}>
        <BackButton fallback="/studio" />
        <NextStepCard balance={balance} libraryLive={library.live} />
      </Screen>
    );
  }

  if (shot) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bgDeep, paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
        <Image source={{ uri: shot.uri }} style={styles.fill} contentFit="contain" accessibilityLabel={t("addPhoto.title")} />
        <View style={{ paddingHorizontal: space.gutter, gap: space.xs, paddingTop: space.md }}>
          {error ? <Banner tone="danger" message={error} /> : null}
          <Button label={t("addPhoto.usePhoto")} onPress={use} loading={preparing.busy} />
          <Button
            variant="secondary"
            label={t("addPhoto.retake")}
            onPress={() => {
              setShot(null);
              setError(null);
            }}
            disabled={preparing.busy}
          />
        </View>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: colors.bgDeep }]}>
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  if (!permission.granted) {
    const denied = !permission.canAskAgain;
    return (
      <Screen
        scroll
        contentStyle={{ gap: space.lg }}
        footer={
          <View style={{ gap: space.xs }}>
            {denied ? (
              <Button label={t("addPhoto.openSettings")} onPress={() => void Linking.openSettings()} />
            ) : (
              <Button label={t("addPhoto.allow")} icon="camera" onPress={() => void requestPermission()} />
            )}
            <Button variant="secondary" label={t("addPhoto.gallery")} icon="image" onPress={() => void pick()} />
            {library.live ? <Button variant="ghost" label={t("addPhoto.sample")} onPress={() => router.push("/library")} /> : null}
          </View>
        }
      >
        <BackButton fallback="/studio" />
        <View style={{ gap: space.sm, marginTop: space.xl }}>
          <Feather name={denied ? "camera-off" : "camera"} size={40} color={colors.accentText} />
          <Text variant="title1" accessibilityRole="header">
            {denied ? t("addPhoto.deniedTitle") : t("addPhoto.askTitle")}
          </Text>
          <Text variant="lead">{denied ? t("addPhoto.deniedBody") : t("addPhoto.askBody")}</Text>
          {error ? <Banner tone="danger" message={error} /> : null}
        </View>
      </Screen>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: "#000" }]}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flash}
        onCameraReady={() => setCameraReady(true)}
        testID="camera"
      />
      <View style={[styles.top, { paddingTop: insets.top + space.xs, paddingHorizontal: space.gutter }]}>
        <IconButton variant="onPhoto" icon="arrow-left" label={t("common.back")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/studio"))} />
        <IconButton
          variant="onPhoto"
          icon={flash === "on" ? "zap" : "zap-off"}
          label={flash === "on" ? t("addPhoto.flashOn") : t("addPhoto.flashOff")}
          onPress={() => setFlash((f) => (f === "on" ? "off" : "on"))}
        />
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.gutter, gap: space.md }]}>
        {error ? <Banner tone="danger" message={error} /> : null}
        <Text variant="small" align="center" style={styles.hint}>
          {t("addPhoto.hint")}
        </Text>
        <View style={styles.controls}>
          <IconButton variant="onPhoto" icon="image" label={t("addPhoto.gallery")} onPress={() => void pick()} />
          <Pressable
            onPress={take}
            disabled={taking.busy || !cameraReady}
            accessibilityRole="button"
            accessibilityLabel={t("addPhoto.shutter")}
            accessibilityState={{ disabled: taking.busy || !cameraReady }}
            style={({ pressed }) => [styles.shutter, { opacity: pressed || taking.busy || !cameraReady ? 0.6 : 1 }]}
            testID="shutter"
          >
            <View style={styles.shutterInner} />
          </Pressable>
          {library.live ? (
            <Pressable onPress={() => router.push("/library")} accessibilityRole="button" style={styles.sample} hitSlop={8}>
              <Text variant="small" align="center" style={styles.sampleText}>
                {t("addPhoto.sample")}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.sample} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  top: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between" },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0 },
  hint: { color: "#ffffff", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#ffffff" },
  sample: { width: 72, alignItems: "center" },
  sampleText: { color: "#ffffff", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
});
