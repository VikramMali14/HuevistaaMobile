import type { ConversationSummary } from "@/api/endpoints/support";

import { ongoing, startedChat, statusLabel, subjectFrom } from "../support";

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

  it("finds the chat a lost start made: same subject, moved since the ask", () => {
    const askedAt = Date.parse("2026-10-08T04:30:00Z"); // 10:00 in India
    const list = [chat("old", { updatedAt: "2026-10-07T09:00:00" }), chat("new", { updatedAt: "2026-10-08T10:00:20" })];
    expect(startedChat(list, "My payment didn't go through", askedAt)?.id).toBe("new");
    expect(startedChat([chat("old", { updatedAt: "2026-10-07T09:00:00" })], "My payment didn't go through", askedAt)).toBeNull();
    expect(startedChat(list, "Something else entirely", askedAt)).toBeNull();
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
