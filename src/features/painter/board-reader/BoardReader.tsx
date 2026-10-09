import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { QUIET_LIMIT_MS, ReaderSession, type BoardReaderProps, type ReaderErrorCode } from "./protocol";

/**
 * Reads one file for a board's QR, in a WebView nobody sees (P7). Mount it with a `key`
 * per file and unmount it to stop. See ./protocol.ts for the conversation.
 *
 * The page (pdf.js, jsQR and the reader — about 2 MB) is loaded only when a file is read.
 * The WebView is held to that page: no other page loads (or opens elsewhere — every URL
 * passes the allowlist so that none is handed to the browser, and all but the page's own
 * are refused), no files, no storage, no new windows, and the page's own policy refuses
 * the network.
 */
export function BoardReader({ job, onProgress, onDone }: BoardReaderProps) {
  const [html, setHtml] = useState<string | null>(null);
  const web = useRef<WebView>(null);
  const events = useRef({ onProgress, onDone });
  const session = useRef<ReaderSession | null>(null);
  const quiet = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    events.current = { onProgress, onDone };
  });

  /** Any word from the page restarts the wait; a page that goes quiet has stopped. */
  const heard = () => {
    if (quiet.current) clearTimeout(quiet.current);
    quiet.current = session.current?.done ? null : setTimeout(() => session.current?.fail(), QUIET_LIMIT_MS);
  };
  const fail = (code?: ReaderErrorCode) => session.current?.fail(code);

  useEffect(() => {
    let live = true;
    session.current = new ReaderSession(job, (text) => web.current?.postMessage(text), {
      onProgress: (p) => events.current.onProgress(p),
      onDone: (o) => events.current.onDone(o),
    });
    heard();
    import("./reader-html.generated")
      .then((m) => {
        if (live) setHtml(m.READER_HTML);
      })
      .catch(() => session.current?.fail());
    return () => {
      live = false;
      if (quiet.current) clearTimeout(quiet.current);
    };
    // One reading per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!html) return null;
  return (
    <View style={styles.hidden} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        ref={web}
        source={{ html }}
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={(r) => r.url.startsWith("about:")}
        onMessage={(e: WebViewMessageEvent) => {
          session.current?.receive(e.nativeEvent.data);
          heard();
        }}
        onError={() => fail()}
        onRenderProcessGone={() => fail("memory")}
        onContentProcessDidTerminate={() => fail("memory")}
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled={false}
        incognito
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        geolocationEnabled={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        style={styles.web}
        testID="board-reader"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: "absolute", left: 0, top: 0, width: 2, height: 2, opacity: 0, overflow: "hidden" },
  web: { width: 2, height: 2, backgroundColor: "transparent" },
});
