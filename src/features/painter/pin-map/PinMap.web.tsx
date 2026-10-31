import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { Banner, Text } from "@/components/ui";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

import { PinMapSession, type MapState, type PinMapProps } from "./protocol";

/**
 * The web preview's pin map: the same page as the phone's, in a sandboxed iframe — scripts only,
 * no shared origin, so it can't reach this app's storage; the page's policy lets it reach
 * OpenFreeMap and nothing else. Its credits open in a new tab.
 */
export function PinMap({ pin, zoom, onMove, disabled }: PinMapProps & { onTouch?: (touching: boolean) => void }) {
  const { colors, radius, space } = useTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [state, setState] = useState<MapState>("loading");
  const frame = useRef<HTMLIFrameElement | null>(null);
  const events = useRef({ onMove });
  const session = useRef<PinMapSession | null>(null);

  useEffect(() => {
    events.current = { onMove };
  });

  useEffect(() => {
    session.current = new PinMapSession((text) => frame.current?.contentWindow?.postMessage(text, "*"), {
      onMove: (moved) => events.current.onMove(moved),
      onState: setState,
    });
  }, []);

  useEffect(() => {
    session.current?.update({ pin, zoom, held: Boolean(disabled) });
  });

  useEffect(() => {
    let live = true;
    const onMessage = (e: MessageEvent) => {
      if (frame.current && e.source === frame.current.contentWindow) session.current?.receive(e.data);
    };
    window.addEventListener("message", onMessage);
    import("./map-html.generated")
      .then((m) => {
        if (live) setHtml(m.MAP_HTML);
      })
      .catch(() => setState("failed"));
    return () => {
      live = false;
      window.removeEventListener("message", onMessage);
    };
  }, []);

  if (state === "failed") return <Banner tone="warning" message={t("painter.nearby.mapFailed")} testID="pin-map-failed" />;

  return (
    <View
      style={{ height: 300, overflow: "hidden", borderWidth: 1, borderRadius: radius.md, borderColor: colors.ruleStrong, backgroundColor: colors.surfaceSoft }}
      testID="pin-map"
    >
      {html ? (
        <iframe
          ref={frame}
          srcDoc={html}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          title={t("painter.nearby.mapLabel")}
          style={{ width: "100%", height: "100%", border: 0 }}
        />
      ) : null}
      {state === "loading" ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: space.sm, alignItems: "center" }} pointerEvents="none">
          <Text variant="small" tone="soft">
            {t("painter.nearby.mapLoading")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
