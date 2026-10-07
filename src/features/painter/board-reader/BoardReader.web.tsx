import { useEffect, useRef, useState } from "react";

import { QUIET_LIMIT_MS, ReaderSession, type BoardReaderProps } from "./protocol";

/**
 * The web preview's board reader: the same page as the phone's, in a sandboxed iframe —
 * scripts only, no shared origin, so it can't reach this app's storage or the network.
 */
export function BoardReader({ job, onProgress, onDone }: BoardReaderProps) {
  const [html, setHtml] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const events = useRef({ onProgress, onDone });

  useEffect(() => {
    events.current = { onProgress, onDone };
  });

  useEffect(() => {
    let live = true;
    let quiet: ReturnType<typeof setTimeout> | null = null;
    const session = new ReaderSession(job, (text) => frame.current?.contentWindow?.postMessage(text, "*"), {
      onProgress: (p) => events.current.onProgress(p),
      onDone: (o) => events.current.onDone(o),
    });
    const heard = () => {
      if (quiet) clearTimeout(quiet);
      quiet = session.done ? null : setTimeout(() => session.fail(), QUIET_LIMIT_MS);
    };
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      session.receive(e.data);
      heard();
    };
    window.addEventListener("message", onMessage);
    heard();
    import("./reader-html.generated")
      .then((m) => {
        if (live) setHtml(m.READER_HTML);
      })
      .catch(() => session.fail());
    return () => {
      live = false;
      if (quiet) clearTimeout(quiet);
      window.removeEventListener("message", onMessage);
    };
    // One reading per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!html) return null;
  return (
    <iframe
      ref={frame}
      srcDoc={html}
      sandbox="allow-scripts"
      title="board reader"
      aria-hidden
      tabIndex={-1}
      style={{ position: "absolute", left: 0, top: 0, width: 2, height: 2, opacity: 0, border: 0, pointerEvents: "none" }}
    />
  );
}
