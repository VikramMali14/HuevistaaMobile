import { Asset } from "expo-asset";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, View } from "react-native";

import { BackButton, Banner, Button, Screen, Text, useToast } from "@/components/ui";
import { summarise, TARGET_MS, type CheckResult } from "@/features/studio/engine/check";
import { RoomCanvas, type CanvasState, type CanvasWall, type RoomCanvasHandle } from "@/features/studio/engine/RoomCanvas";
import { loadBundledTexture } from "@/features/studio/engine/texture-loader";
import { t } from "@/i18n";
import { appVersion } from "@/lib/app-version";
import { useTheme } from "@/theme";

const PHOTO = require("../../assets/images/welcome/room-original.jpg");
const WALL_LEFT = require("../../assets/images/sample-room/wall-left.png");
const WALL_MAIN = require("../../assets/images/sample-room/wall-main.png");

/** How many colour changes the check times. */
const RUNS = 60;
const COLOURS = ["#7b8a72", "#b96b48", "#3e4a52", "#e8d5b0", "#c9a227", "#5b6d8c", "#a3485a", "#f2e6d0"];

async function bundled(module: number) {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  return loadBundledTexture(asset.localUri ?? asset.uri, asset.width ?? 0, asset.height ?? 0);
}

/**
 * The live-colour check (Phase 3's spike, kept): paints a sample room that ships with the
 * app — two walls, the website's engine — 60 times and times every change. Run it on the
 * phone in question; docs/04 C11 wants each change on screen in under 100 ms. Opened from
 * Settings (press and hold the version).
 */
export default function EngineCheck() {
  const toast = useToast();
  const { space } = useTheme();
  const canvas = useRef<RoomCanvasHandle>(null);
  const started = useRef(0);
  const [state, setState] = useState<CanvasState>({ kind: "loading" });
  const [firstFrame, setFirstFrame] = useState<number | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [running, setRunning] = useState(false);

  const walls = useMemo<CanvasWall[]>(
    () => [
      { id: "left", maskKey: "left", load: () => bundled(WALL_LEFT), hex: "#7b8a72", lrv: null },
      { id: "main", maskKey: "main", load: () => bundled(WALL_MAIN), hex: "#e8d5b0", lrv: null },
    ],
    [],
  );

  useEffect(() => {
    started.current = Date.now();
  }, []);

  const onState = useCallback((s: CanvasState) => {
    setState(s);
    if (s.kind === "ready") setFirstFrame(Date.now() - started.current);
  }, []);

  const run = async () => {
    if (!canvas.current || running) return;
    setRunning(true);
    setResult(null);
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const colours = new Map([
        ["left", COLOURS[i % COLOURS.length]!],
        ["main", COLOURS[(i + 3) % COLOURS.length]!],
      ]);
      times.push(canvas.current.renderTimed(colours));
      // Let the screen show each frame, as a person tapping swatches would see it.
      await new Promise((r) => setTimeout(r, 16));
    }
    canvas.current.renderTimed();
    setResult(summarise(times, firstFrame ?? 0));
    setRunning(false);
  };

  const copy = async () => {
    if (!result) return;
    const { version, build } = appVersion();
    const text = [
      `HueVistaa ${version} (${build}) · ${Platform.OS} ${String(Platform.Version)}`,
      `First frame ${Math.round(result.firstFrameMs)} ms`,
      `Colour change: median ${result.medianMs.toFixed(1)} ms · 95% ${result.p95Ms.toFixed(1)} ms · worst ${result.maxMs.toFixed(1)} ms`,
    ].join("\n");
    await Clipboard.setStringAsync(text).catch(() => {});
    toast.show(t("engineCheck.copied"), "success");
  };

  const passed = result ? result.p95Ms < TARGET_MS : null;

  return (
    <Screen padded contentStyle={{ gap: space.md, flex: 1 }}>
      <BackButton fallback="/settings" />
      <View style={{ gap: space.xs }}>
        <Text variant="title1" accessibilityRole="header">
          {t("engineCheck.title")}
        </Text>
        <Text variant="body" tone="soft">
          {t("engineCheck.lead", { n: RUNS, ms: TARGET_MS })}
        </Text>
      </View>
      <RoomCanvas
        ref={canvas}
        photo={() => bundled(PHOTO)}
        photoKey="sample-room"
        walls={walls}
        cleaned
        onState={onState}
        style={{ flex: 1, minHeight: 240 }}
        testID="engine-canvas"
      />
      {state.kind === "noGl" ? <Banner tone="danger" message={t("engineCheck.noGl")} /> : null}
      {state.kind === "failed" ? <Banner tone="danger" message={t("engineCheck.failed")} /> : null}
      {result ? (
        <View style={{ gap: 2 }} accessibilityLiveRegion="polite" testID="engine-result">
          <Text variant="bodyStrong" tone={passed ? "success" : "danger"}>
            {passed ? t("engineCheck.pass", { ms: TARGET_MS }) : t("engineCheck.fail", { ms: TARGET_MS })}
          </Text>
          <Text variant="small" tone="soft">
            {t("engineCheck.numbers", {
              median: result.medianMs.toFixed(1),
              p95: result.p95Ms.toFixed(1),
              worst: result.maxMs.toFixed(1),
              first: Math.round(result.firstFrameMs),
            })}
          </Text>
        </View>
      ) : null}
      <View style={{ gap: space.xs }}>
        <Button label={t("engineCheck.run")} onPress={() => void run()} loading={running} disabled={state.kind !== "ready"} />
        {result ? <Button variant="ghost" label={t("engineCheck.copy")} onPress={() => void copy()} /> : null}
      </View>
    </Screen>
  );
}
