import { rewardTokenFrom } from "../reward-token";

/**
 * The app's side of the board reader (P7): a hidden WebView (an iframe on the web) runs
 * pdf.js and jsQR over a file the painter picked, with no network, and this talks to it.
 * The page is scripts/board-reader/reader.js, built into reader-html.generated.ts.
 *
 * Page → app:  ready · ack {seq} · progress {page, pages} · found {text, page} · none ·
 *              error {code, detail}
 * App → page:  begin {kind, mime, size} · chunk {seq, data} · end · verdict {ours}
 *
 * The file goes over in base64 chunks, each one acknowledged before the next is sent, so
 * nothing piles up in the bridge. The page hands back every QR text it reads; whether one
 * is ours is decided here, by the same rule the camera uses (rewardTokenFrom), and the
 * page carries on reading after a "no". Anything said twice, out of turn or after the end
 * is ignored.
 */

export type BoardKind = "pdf" | "image";

export interface ReaderJob {
  /** The file, in base64. */
  base64: string;
  kind: BoardKind;
  mime: string;
}

export interface ReaderProgress {
  /** The page being read, 1-based. The last is read first, then the first, then backwards. */
  page: number;
  pages: number;
}

export type ReaderErrorCode = "locked" | "unreadable" | "image" | "canvas" | "memory" | "failed";

export type ReaderOutcome = { kind: "found"; token: string } | { kind: "none" } | { kind: "error"; code: ReaderErrorCode };

/** Base64 characters per chunk: a multiple of 4, so each chunk decodes on its own. */
export const CHUNK_CHARS = 256 * 1024;

const ERROR_CODES: readonly ReaderErrorCode[] = ["locked", "unreadable", "image", "canvas", "memory", "failed"];

/** How many bytes a base64 text holds. */
export function byteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

type PageMessage =
  | { type: "ready" }
  | { type: "ack"; seq: number }
  | { type: "progress"; page: number; pages: number }
  | { type: "found"; text: string; page: number }
  | { type: "none" }
  | { type: "error"; code: ReaderErrorCode };

/** A message from the page, or null for anything that isn't one. */
export function parsePageMessage(raw: unknown): PageMessage | null {
  if (typeof raw !== "string") return null;
  let m: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    m = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  switch (m.type) {
    case "ready":
    case "none":
      return { type: m.type };
    case "ack":
      return whole(m.seq) ? { type: "ack", seq: m.seq } : null;
    case "progress":
      return whole(m.page) && whole(m.pages) && m.page >= 1 && m.page <= m.pages ? { type: "progress", page: m.page, pages: m.pages } : null;
    case "found":
      return typeof m.text === "string" ? { type: "found", text: m.text, page: whole(m.page) ? m.page : 0 } : null;
    case "error":
      return { type: "error", code: ERROR_CODES.includes(m.code as ReaderErrorCode) ? (m.code as ReaderErrorCode) : "failed" };
    default:
      return null;
  }
}

export interface ReaderEvents {
  onProgress: (progress: ReaderProgress) => void;
  /** Called once: the token, nothing, or why not. */
  onDone: (outcome: ReaderOutcome) => void;
}

export interface BoardReaderProps extends ReaderEvents {
  job: ReaderJob;
}

/** Longer than any one page takes on a slow phone; the page reports each page it starts. */
export const QUIET_LIMIT_MS = 60_000;

/** One reading of one file: feed it what the page says; it says back through `post`. */
export class ReaderSession {
  private readonly base64: string;
  private readonly chunks: number;
  private started = false;
  private sent = -1;
  private finished = false;

  constructor(
    private readonly job: ReaderJob,
    private readonly post: (text: string) => void,
    private readonly events: ReaderEvents,
  ) {
    this.base64 = /\s/.test(job.base64) ? job.base64.replace(/\s+/g, "") : job.base64;
    this.chunks = Math.ceil(this.base64.length / CHUNK_CHARS);
  }

  get done(): boolean {
    return this.finished;
  }

  receive(raw: unknown): void {
    if (this.finished) return;
    const message = parsePageMessage(raw);
    if (!message) return;
    switch (message.type) {
      case "ready":
        if (this.started) return;
        this.started = true;
        if (!this.base64) return this.finish({ kind: "error", code: "unreadable" });
        this.send({ type: "begin", kind: this.job.kind, mime: this.job.mime, size: byteLength(this.base64) });
        this.next();
        return;
      case "ack":
        if (message.seq === this.sent) this.next();
        return;
      case "progress":
        this.events.onProgress({ page: message.page, pages: message.pages });
        return;
      case "found": {
        const token = rewardTokenFrom(message.text);
        this.send({ type: "verdict", ours: token !== null });
        if (token) this.finish({ kind: "found", token });
        return;
      }
      case "none":
        return this.finish({ kind: "none" });
      case "error":
        return this.finish({ kind: "error", code: message.code });
    }
  }

  /** The page stopped answering, or went away. */
  fail(code: ReaderErrorCode = "failed"): void {
    if (!this.finished) this.finish({ kind: "error", code });
  }

  private next() {
    this.sent += 1;
    if (this.sent < this.chunks) {
      const at = this.sent * CHUNK_CHARS;
      this.send({ type: "chunk", seq: this.sent, data: this.base64.slice(at, at + CHUNK_CHARS) });
    } else if (this.sent === this.chunks) {
      this.send({ type: "end" });
    }
  }

  private send(message: object) {
    this.post(JSON.stringify(message));
  }

  private finish(outcome: ReaderOutcome) {
    this.finished = true;
    this.events.onDone(outcome);
  }
}
