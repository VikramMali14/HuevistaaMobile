import { byteLength, CHUNK_CHARS, parsePageMessage, ReaderSession, type ReaderOutcome, type ReaderProgress } from "../board-reader/protocol";

const TOKEN = "0VkTlzUw5CGJ-bTtxixeiS0nVfg";

/** The app's side, with the page played by the test. */
function session(base64: string, kind: "pdf" | "image" = "pdf") {
  const sent: Record<string, unknown>[] = [];
  const progress: ReaderProgress[] = [];
  const done: ReaderOutcome[] = [];
  const s = new ReaderSession({ base64, kind, mime: kind === "pdf" ? "application/pdf" : "image/jpeg" }, (text) => sent.push(JSON.parse(text)), {
    onProgress: (p) => progress.push(p),
    onDone: (o) => done.push(o),
  });
  const page = (message: object) => s.receive(JSON.stringify(message));
  return { s, sent, progress, done, page };
}

describe("the board reader's conversation", () => {
  it("sends the file in acknowledged chunks, then says it's all there", () => {
    const base64 = "A".repeat(CHUNK_CHARS * 2 + 8);
    const { sent, page } = session(base64);
    page({ type: "ready" });
    expect(sent.map((m) => m.type)).toEqual(["begin", "chunk"]);
    expect(sent[0]).toEqual({ type: "begin", kind: "pdf", mime: "application/pdf", size: byteLength(base64) });
    expect(sent[1]).toMatchObject({ seq: 0 });
    expect((sent[1]!.data as string).length).toBe(CHUNK_CHARS);

    // Nothing more until the page has taken it; an ack out of turn moves nothing.
    page({ type: "ack", seq: 5 });
    expect(sent).toHaveLength(2);
    page({ type: "ack", seq: 0 });
    page({ type: "ack", seq: 0 });
    expect(sent.map((m) => m.seq ?? m.type)).toEqual(["begin", 0, 1]);
    page({ type: "ack", seq: 1 });
    expect(sent[3]).toMatchObject({ type: "chunk", seq: 2, data: "AAAAAAAA" });
    page({ type: "ack", seq: 2 });
    expect(sent[4]).toEqual({ type: "end" });
    // A second "ready" (the page reloaded) doesn't start the file again.
    page({ type: "ready" });
    expect(sent).toHaveLength(5);
    // Every chunk is whole base64, so each decodes on its own in the page.
    expect(CHUNK_CHARS % 4).toBe(0);
  });

  it("counts the bytes base64 holds, and drops line breaks first", () => {
    expect(byteLength("AAAA")).toBe(3);
    expect(byteLength("AAA=")).toBe(2);
    expect(byteLength("AA==")).toBe(1);
    const { sent, page } = session("AAAA\nAA==\n");
    page({ type: "ready" });
    expect(sent[0]).toMatchObject({ size: 4 });
    expect(sent[1]).toMatchObject({ data: "AAAAAA==" });
  });

  // Whether a QR is ours is the app's rule (rewardTokenFrom), not the page's.
  it("refuses a QR that isn't ours and lets the page read on, then takes ours", () => {
    const { sent, done, page } = session("AAAA");
    page({ type: "ready" });
    page({ type: "found", text: "upi://pay?pa=shop@bank", page: 4 });
    expect(sent.at(-1)).toEqual({ type: "verdict", ours: false });
    expect(done).toEqual([]);
    page({ type: "found", text: `https://app.huevista.org/r/${TOKEN}`, page: 4 });
    expect(sent.at(-1)).toEqual({ type: "verdict", ours: true });
    expect(done).toEqual([{ kind: "found", token: TOKEN }]);
  });

  it("reports pages as they're read, and ends once", () => {
    const { progress, done, page, s } = session("AAAA");
    page({ type: "ready" });
    page({ type: "progress", page: 4, pages: 4 });
    page({ type: "progress", page: 9, pages: 4 });
    expect(progress).toEqual([{ page: 4, pages: 4 }]);
    page({ type: "none" });
    page({ type: "error", code: "locked" });
    s.fail();
    expect(done).toEqual([{ kind: "none" }]);
    expect(s.done).toBe(true);
  });

  it("passes on why a file couldn't be read, and makes an unknown reason a plain failure", () => {
    const locked = session("AAAA");
    locked.page({ type: "error", code: "locked" });
    expect(locked.done).toEqual([{ kind: "error", code: "locked" }]);
    const odd = session("AAAA");
    odd.page({ type: "error", code: "gremlins" });
    expect(odd.done).toEqual([{ kind: "error", code: "failed" }]);
  });

  it("says an empty file is unreadable without sending it", () => {
    const { sent, done, page } = session("");
    page({ type: "ready" });
    expect(sent).toEqual([]);
    expect(done).toEqual([{ kind: "error", code: "unreadable" }]);
  });

  it("ignores anything that isn't one of the page's messages", () => {
    expect(parsePageMessage("not json")).toBeNull();
    expect(parsePageMessage(JSON.stringify({ type: "begin" }))).toBeNull();
    expect(parsePageMessage(JSON.stringify({ type: "ack", seq: -1 }))).toBeNull();
    expect(parsePageMessage(JSON.stringify({ type: "found" }))).toBeNull();
    expect(parsePageMessage({ type: "ready" })).toBeNull();
    expect(parsePageMessage(JSON.stringify(null))).toBeNull();
  });
});
