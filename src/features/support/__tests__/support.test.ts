import type { ConversationSummary } from "@/api/endpoints/support";

import { LANDS_WITHIN_MS, lookFor, ongoing, startedChat, statusLabel, subjectFrom } from "../support";

const chat = (id: string, extra: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id,
  channel: "IN_APP",
  status: "OPEN",
  subject: "My payment didn't go through",
  lastMessage: "",
  updatedAt: "2026-10-08T10:00:00",
  ...extra,
});

describe("support (S6, S7)", () => {
  // The server names a chat after its first message; that's how a lost start is found.
  it("makes the subject the way the server does", () => {
    expect(subjectFrom("  My   payment\ndidn't go through ")).toBe("My payment didn't go through");
    expect(subjectFrom("x".repeat(61))).toBe(`${"x".repeat(57)}…`);
    expect(subjectFrom("x".repeat(60))).toBe("x".repeat(60));
    expect(subjectFrom("   ")).toBe("Support request");
  });

  // The same subject can come twice (the payment result writes the same words), so only
  // a chat that wasn't there before the ask is the one it made.
  it("finds the chat a lost start made: same subject, not on the list before", () => {
    const askedAt = Date.parse("2026-10-08T04:30:00Z"); // 10:00 in India
    const list = [chat("new", { updatedAt: "2026-10-08T10:00:20" }), chat("earlier", { updatedAt: "2026-10-08T09:59:00" })];
    expect(startedChat(list, "My payment didn't go through", new Set(["earlier"]), askedAt)?.id).toBe("new");
    expect(startedChat([chat("earlier")], "My payment didn't go through", new Set(["earlier"]), askedAt)).toBeNull();
    expect(startedChat(list, "Something else entirely", new Set(["earlier"]), askedAt)).toBeNull();
    // A phone clock minutes fast doesn't hide it.
    expect(startedChat(list, "My payment didn't go through", new Set(["earlier"]), askedAt + 5 * 60_000)?.id).toBe("new");
  });

  it("without a list from before, takes one with that subject moved in the last minutes", () => {
    const askedAt = Date.parse("2026-10-08T04:30:00Z");
    const list = [chat("old", { updatedAt: "2026-10-07T09:00:00" }), chat("new", { updatedAt: "2026-10-08T10:00:20" })];
    expect(startedChat(list, "My payment didn't go through", null, askedAt)?.id).toBe("new");
    expect(startedChat([chat("old", { updatedAt: "2026-10-07T09:00:00" })], "My payment didn't go through", null, askedAt)).toBeNull();
  });

  // The server answers inside the transaction that saves the message, so a send can't be
  // seen until its answer is in: one look straight after a dropped connection proves nothing.
  describe("looking for a send whose answer was lost", () => {
    const clock = (start: number) => {
      let at = start;
      return { now: () => at, wait: async (ms: number) => void (at += ms) };
    };

    it("keeps looking until it shows", async () => {
      const c = clock(1_000);
      const answers = [null, null, "there"];
      const find = jest.fn(async () => answers.shift() ?? null);
      await expect(lookFor(find, 1_000, c)).resolves.toEqual({ found: "there" });
      expect(find).toHaveBeenCalledTimes(3);
    });

    it("says it isn't there only once it can't land any more", async () => {
      const c = clock(1_000);
      const find = jest.fn(async () => null);
      await expect(lookFor(find, 1_000, c)).resolves.toEqual({ found: null, sure: true });
      expect(c.now()).toBeGreaterThanOrEqual(1_000 + LANDS_WITHIN_MS);
      expect(find.mock.calls.length).toBeGreaterThan(20);
    });

    it("is unsure when the last look failed, or the screen went", async () => {
      const failing = jest.fn(async (): Promise<string | null> => {
        throw new Error("offline");
      });
      await expect(lookFor(failing, 1_000, clock(1_000))).resolves.toEqual({ found: null, sure: false });
      const find = jest.fn(async () => null);
      await expect(lookFor(find, 1_000, { ...clock(1_000), alive: () => false })).resolves.toEqual({ found: null, sure: false });
      expect(find).toHaveBeenCalledTimes(1);
    });
  });

  it("offers the newest chat still going", () => {
    expect(ongoing([chat("a", { status: "RESOLVED" }), chat("b", { status: "NEEDS_HUMAN" })])?.id).toBe("b");
    expect(ongoing([chat("a", { status: "RESOLVED" })])).toBeNull();
  });

  it("names where a chat stands", () => {
    expect(statusLabel("NEEDS_HUMAN")).toBe("Waiting for our team");
    expect(statusLabel("RESOLVED")).toBe("Resolved");
    expect(statusLabel("OPEN")).toBe("Open");
  });
});
