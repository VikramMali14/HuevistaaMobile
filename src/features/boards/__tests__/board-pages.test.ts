import type { SavedCombo } from "@/features/studio/tray-store";

import {
  boardBlockedReason,
  boardClosesRoom,
  boardOption,
  boardsLeft,
  fileSlug,
  moved,
  pageCount,
  recordedPages,
} from "../board-pages";

const walls = [
  { id: "11", label: "Main wall" },
  { id: "12", label: "Accent wall" },
  { id: "13", label: "Trim" },
];
const combo = (colours: SavedCombo["colours"]): SavedCombo => ({ colours, savedAt: 1 });

describe("a saved combination as a board page", () => {
  it("lists its walls in the plan's order, with codes, and leaves out walls it didn't paint", () => {
    const option = boardOption(
      combo({ "13": { hex: "#ffffff", code: "HV0001" }, "11": { hex: "#e8d5b0", code: "HV0101", lrv: 72 } }),
      walls,
      () => null,
      false,
    );
    expect(option.shades).toEqual([
      { label: "Main wall", regionId: 11, rawCode: "HV0101", name: "", code: "HV0101", hex: "#e8d5b0" },
      { label: "Trim", regionId: 13, rawCode: "HV0001", name: "", code: "HV0001", hex: "#ffffff" },
    ]);
    expect([...option.paints]).toEqual([
      ["11", { hex: "#e8d5b0", lrv: 72 }],
      ["13", { hex: "#ffffff", lrv: null }],
    ]);
  });

  it("drops a wall that has gone from the room since the combination was kept", () => {
    const option = boardOption(combo({ "99": { hex: "#000000", code: "HV0999" } }), walls, () => null, false);
    expect(option.shades).toEqual([]);
  });

  it("prints names only where the scheme shows them; a mixed colour is Custom colour then", () => {
    const named = boardOption(
      combo({ "11": { hex: "#e8d5b0", code: "HV0101" }, "12": { hex: "#123456", code: null } }),
      walls,
      (code) => (code === "HV0101" ? "Ivory Mist" : null),
      true,
    );
    expect(named.shades.map((s) => s.name)).toEqual(["Ivory Mist", "Custom colour"]);
    const hidden = boardOption(combo({ "12": { hex: "#123456", code: null } }), walls, () => null, false);
    expect(hidden.shades[0]!.name).toBe("");
  });

  it("records each page's shades per wall, as the backend takes them", () => {
    const option = boardOption(combo({ "11": { hex: "#e8d5b0", code: "HV0101" }, "12": { hex: "#123456", code: null } }), walls, () => null, false);
    expect(recordedPages([option])).toEqual([
      {
        shades: [
          { regionId: 11, regionLabel: "Main wall", shadeCode: "HV0101", shadeName: null, hex: "#e8d5b0" },
          { regionId: 12, regionLabel: "Accent wall", shadeCode: null, shadeName: null, hex: "#123456" },
        ],
      },
    ]);
  });
});

describe("what a room's next board means", () => {
  it("counts the reward page for a room of its own, not a ready-made one", () => {
    expect(pageCount(3, { fromLibrary: false })).toBe(4);
    expect(pageCount(3, { fromLibrary: true })).toBe(3);
  });

  it("knows how many boards are left, and when the next closes the room", () => {
    expect(boardsLeft({ boardsUsed: 0, boardsAllowed: 1 })).toBe(1);
    expect(boardsLeft({ boardsUsed: 1, boardsAllowed: 2 })).toBe(1);
    expect(boardsLeft({ boardsUsed: 3, boardsAllowed: 2 })).toBe(0);
    expect(boardsLeft({})).toBeNull();
    expect(boardClosesRoom({ boardsUsed: 0, boardsAllowed: 1 })).toBe(true);
    expect(boardClosesRoom({ boardsUsed: 0, boardsAllowed: 2 })).toBe(false);
    expect(boardClosesRoom({})).toBe(false);
  });

  it("says why a room can't take a board, closure first", () => {
    expect(boardBlockedReason({ closedAt: "2026-10-01T10:00:00", readOnly: true, boardsUsed: 1, boardsAllowed: 1 })).toMatch(/finished/);
    expect(boardBlockedReason({ readOnly: true, readOnlyReason: "This room's time ran out." })).toBe("This room's time ran out.");
    expect(boardBlockedReason({ readOnly: true })).toMatch(/view only/);
    expect(boardBlockedReason({ boardsUsed: 1, boardsAllowed: 1 })).toBe("This room has handed over its colour board.");
    expect(boardBlockedReason({ boardsUsed: 2, boardsAllowed: 2 })).toBe("This room has handed over all 2 of its colour boards.");
    expect(boardBlockedReason({ boardsUsed: 0, boardsAllowed: 1 })).toBeNull();
  });
});

describe("small helpers", () => {
  it("moves an option up or down, and leaves the list alone out of range", () => {
    expect(moved(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(moved(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moved(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moved(["a", "b"], 1, 2)).toEqual(["a", "b"]);
  });

  it("makes a room's name safe for a file name", () => {
    expect(fileSlug("Living room")).toBe("living-room");
    expect(fileSlug("  Priya's Bedroom #2 ")).toBe("priya-s-bedroom-2");
    expect(fileSlug("बैठक")).toBe("room");
  });
});
