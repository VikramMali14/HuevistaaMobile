import { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { Banner, Text } from "@/components/ui";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

import { MAP_HTML } from "./map-html.generated";
import { PinMapSession, type MapState, type PinMapProps } from "./protocol";

/** A page that hasn't said it is there in this long never will. */
const LOADED_MS = 15_000;

/**
 * Where the painter is based, chosen on a map (P5): the pin stays in the middle and the map moves
 * under it — dragged, zoomed, or tapped where the pin should go. Nothing is asked of the phone's
 * location, so it works with location off and indoors. See ./protocol.ts for the conversation.
 *
 * The WebView is held to its one page: no other page loads in it (a link — the map's credits —
 * opens in the browser), no files, no storage, no new windows, and the page's own policy lets it
 * reach OpenFreeMap and nothing else. On Android it keeps a finger's drag from the screen's
 * scroll (nestedScrollEnabled); `onTouch` lets the screen hold its scroll still on iOS.
 */
export function PinMap({ pin, zoom, onMove, disabled, onTouch }: PinMapProps & { onTouch?: (touching: boolean) => void }) {
  const { colors, radius, space } = useTheme();
  const web = useRef<WebView>(null);
  const [state, setState] = useState<MapState>("loading");
  // A WebView whose page process went away is unusable on Android: a new one takes its place.
  const [generation, setGeneration] = useState(0);
  const heard = useRef(false);
  const events = useRef({ onMove });
  const session = useRef<PinMapSession | null>(null);

  useEffect(() => {
    events.current = { onMove };
  });

  useEffect(() => {
    session.current = new PinMapSession((text) => web.current?.postMessage(text), {
      onMove: (moved) => events.current.onMove(moved),
      onState: setState,
    });
  }, []);

  useEffect(() => {
    session.current?.update({ pin, zoom, held: Boolean(disabled) });
  });

  useEffect(() => {
    heard.current = false;
    const timer = setTimeout(() => {
      if (!heard.current) setState("failed");
    }, LOADED_MS);
    return () => clearTimeout(timer);
  }, [generation]);

  if (state === "failed") return <Banner tone="warning" message={t("painter.nearby.mapFailed")} testID="pin-map-failed" />;

  return (
    <View
      style={[styles.box, { borderRadius: radius.md, borderColor: colors.ruleStrong, backgroundColor: colors.surfaceSoft }]}
      onTouchStart={() => onTouch?.(true)}
      onTouchEnd={() => onTouch?.(false)}
      onTouchCancel={() => onTouch?.(false)}
      testID="pin-map"
    >
      <WebView
        key={generation}
        ref={web}
        source={{ html: MAP_HTML }}
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={(r) => {
          if (r.url.startsWith("about:") || r.url.startsWith("data:")) return true;
          if (/^https:\/\//.test(r.url)) void Linking.openURL(r.url).catch(() => undefined);
          return false;
        }}
        onMessage={(e: WebViewMessageEvent) => {
          heard.current = true;
          session.current?.receive(e.nativeEvent.data);
        }}
        onError={() => setState("failed")}
        onRenderProcessGone={() => setGeneration((g) => g + 1)}
        onContentProcessDidTerminate={() => web.current?.reload()}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        geolocationEnabled={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        nestedScrollEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        style={styles.web}
        testID="pin-map-web"
      />
      {state === "loading" ? (
        <View style={[styles.loading, { bottom: space.sm }]} pointerEvents="none">
          <Text variant="small" tone="soft" style={{ backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 4 }}>
            {t("painter.nearby.mapLoading")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 300, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  web: { flex: 1, backgroundColor: "transparent" },
  loading: { position: "absolute", left: 0, right: 0, alignItems: "center" },
});
