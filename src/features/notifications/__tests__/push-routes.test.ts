import { keys } from "@/api/query-keys";

import { invalidationsFor, pathFor, readPayload } from "../push-routes";

describe("a notification's data", () => {
  it("is read only when it's one of ours: a known kind, an account, and clean ids", () => {
    expect(readPayload({ type: "WALLS_READY", userId: "u1", projectId: "p1" })).toEqual(expect.objectContaining({ type: "WALLS_READY", userId: "u1", projectId: "p1" }));
    expect(readPayload({ type: "SOMETHING_ELSE", userId: "u1" })).toBeNull();
    expect(readPayload({ type: "WALLS_READY" })).toBeNull();
    expect(readPayload(null)).toBeNull();
    // An id that isn't an id is dropped, not trusted into a path.
    expect(readPayload({ type: "WALLS_READY", userId: "u1", projectId: "../../settings" })?.projectId).toBeUndefined();
  });

  // The app builds each path from ids; a notification never carries one.
  it("opens the screen for its kind", () => {
    expect(pathFor({ type: "WALLS_READY", userId: "u", projectId: "p1" })).toBe("/room/p1");
    expect(pathFor({ type: "WALLS_FAILED", userId: "u", projectId: "p1" })).toBe("/room/p1");
    expect(pathFor({ type: "AI_IMAGE_READY", userId: "u", projectId: "p1", renderId: "r1" })).toBe("/ai-image/r1?projectId=p1");
    expect(pathFor({ type: "AI_IMAGE_FAILED", userId: "u", renderId: "r1" })).toBe("/ai-image/r1");
    expect(pathFor({ type: "VOUCHER_DELIVERED", userId: "u", redemptionId: "v1" })).toBe("/painter/voucher/v1");
    expect(pathFor({ type: "VOUCHER_REJECTED", userId: "u", redemptionId: "v1" })).toBe("/painter/voucher/v1");
    expect(pathFor({ type: "SUPPORT_REPLY", userId: "u", conversationId: "c1" })).toBe("/help/c1");
    expect(pathFor({ type: "SUPPORT_REPLY", userId: "u" })).toBeNull();
  });

  it("refreshes what it made stale", () => {
    expect(invalidationsFor({ type: "WALLS_READY", userId: "u", projectId: "p1" })).toEqual([
      { queryKey: keys.room("p1"), exact: true },
      { queryKey: keys.projects, exact: true },
    ]);
    // A declined voucher hands the points back: the balance changes as well.
    expect(invalidationsFor({ type: "VOUCHER_REJECTED", userId: "u", redemptionId: "v1" }).map((i) => i.queryKey)).toContainEqual(keys.painterWallet);
    expect(invalidationsFor({ type: "AI_IMAGE_READY", userId: "u", projectId: "p1", renderId: "r1" })).toContainEqual({ queryKey: keys.render("p1", "r1"), exact: true });
    expect(invalidationsFor({ type: "SUPPORT_REPLY", userId: "u", conversationId: "c1" })).toContainEqual({ queryKey: keys.supportConversation("c1"), exact: true });
  });
});
