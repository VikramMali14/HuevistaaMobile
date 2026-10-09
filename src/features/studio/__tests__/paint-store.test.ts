import { ApiError } from "@/api/errors";
import { queryClient } from "@/api/query-client";
import type { RoomDetail } from "@/api/types";

const mockSave = jest.fn();
jest.mock("@/api/endpoints/projects", () => ({ projectsApi: { saveColours: (...a: unknown[]) => mockSave(...a) } }));
// The store listens for the app going to the background; keep its listener to call.
jest.mock("react-native", () => {
  const rn = jest.requireActual("react-native");
  rn.AppState.addEventListener = (_type: string, listener: (state: string) => void) => {
    ((globalThis as { appStateListeners?: ((s: string) => void)[] }).appStateListeners ??= []).push(listener);
    return { remove: () => {} };
  };
  return rn;
});
const appGoes = (state: string) => (globalThis as { appStateListeners?: ((s: string) => void)[] }).appStateListeners?.forEach((l) => l(state));

// eslint-disable-next-line import/first -- after the mocks above
import { applyColours, flush, forgetRoom, getRoomPaint, initRoom, redo, resetPaintStore, saveRows, undo } from "../paint-store";

const room = (hex: string | null = null): Pick<RoomDetail, "regions"> => ({
  regions: [
    { id: 1, label: "", category: "MAIN_WALL", manual: false, maskUrl: "m", appliedHexCode: hex, appliedHvCode: hex ? "HV0001" : null },
    { id: 2, label: "", category: "TRIM", manual: false, maskUrl: "m" },
  ],
});
const green = { hex: "#7b8a72", code: "HV0118", lrv: 30 };
const grey = { hex: "#3e4a52", code: "HV0124", lrv: 10 };

beforeEach(() => {
  jest.useFakeTimers();
  mockSave.mockReset();
  mockSave.mockResolvedValue(undefined);
  resetPaintStore();
});
afterEach(() => jest.useRealTimers());

describe("the paint store", () => {
  it("starts from the colours the room was saved with, on the first wall", () => {
    initRoom("p", room("#efe6d6"), ["1"]);
    expect(getRoomPaint("p").colours["1"]).toEqual({ hex: "#efe6d6", code: "HV0001" });
    expect(getRoomPaint("p").colours["2"]).toBeNull();
    expect(getRoomPaint("p").selected).toBe("1");
  });

  it("saves once, 600 ms after the last change, with every wall that changed", async () => {
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    jest.advanceTimersByTime(400);
    applyColours("p", { "2": grey });
    jest.advanceTimersByTime(599);
    expect(mockSave).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith("p", [
      { regionId: 1, shadeCode: "HV0118", hexCode: "#7b8a72" },
      { regionId: 2, shadeCode: "HV0124", hexCode: "#3e4a52" },
    ]);
    expect(getRoomPaint("p").pending).toEqual({});
  });

  it("ignores a tap on the colour a wall already has", () => {
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    applyColours("p", { "1": { ...green } });
    expect(getRoomPaint("p").history).toHaveLength(1);
  });

  it("undoes the last change and saves the colouring before it", async () => {
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    await jest.advanceTimersByTimeAsync(600);
    applyColours("p", { "1": grey });
    undo("p");
    expect(getRoomPaint("p").colours["1"]).toEqual(green);
    await jest.advanceTimersByTimeAsync(600);
    expect(mockSave).toHaveBeenLastCalledWith("p", [{ regionId: 1, shadeCode: "HV0118", hexCode: "#7b8a72" }]);
  });

  it("redoes what Undo took away and saves it", async () => {
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    await jest.advanceTimersByTimeAsync(600);
    applyColours("p", { "1": grey, "2": green });
    await jest.advanceTimersByTimeAsync(600);
    undo("p");
    await jest.advanceTimersByTimeAsync(600);
    expect(mockSave).toHaveBeenLastCalledWith("p", [
      { regionId: 1, shadeCode: "HV0118", hexCode: "#7b8a72" },
      { regionId: 2, shadeCode: null, hexCode: null },
    ]);
    redo("p");
    expect(getRoomPaint("p").colours).toEqual({ "1": grey, "2": green });
    expect(getRoomPaint("p").future).toHaveLength(0);
    expect(getRoomPaint("p").history).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(600);
    expect(mockSave).toHaveBeenLastCalledWith("p", [
      { regionId: 1, shadeCode: "HV0124", hexCode: "#3e4a52" },
      { regionId: 2, shadeCode: "HV0118", hexCode: "#7b8a72" },
    ]);
    expect(getRoomPaint("p").pending).toEqual({});
  });

  it("walks back and forth through several changes", () => {
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    applyColours("p", { "1": grey });
    undo("p");
    undo("p");
    expect(getRoomPaint("p").colours["1"]).toBeNull();
    redo("p");
    expect(getRoomPaint("p").colours["1"]).toEqual(green);
    redo("p");
    expect(getRoomPaint("p").colours["1"]).toEqual(grey);
    redo("p"); // nothing left to redo
    expect(getRoomPaint("p").colours["1"]).toEqual(grey);
  });

  it("forgets what could be redone once a new colour goes on", () => {
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    undo("p");
    applyColours("p", { "1": grey });
    expect(getRoomPaint("p").future).toEqual([]);
    redo("p");
    expect(getRoomPaint("p").colours["1"]).toEqual(grey);
  });

  it("keeps Redo through a refetch", () => {
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    undo("p");
    initRoom("p", room(), ["1"]);
    redo("p");
    expect(getRoomPaint("p").colours["1"]).toEqual(green);
  });

  it("keeps a change that failed to save, says so, and tries again", async () => {
    mockSave.mockRejectedValueOnce(new Error("offline"));
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    await jest.advanceTimersByTimeAsync(600);
    expect(getRoomPaint("p").saveFailed).toBe(true);
    expect(getRoomPaint("p").pending).toEqual({ "1": green });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(getRoomPaint("p").saveFailed).toBe(false);
  });

  it("never lets a refetch undo a tap that is still waiting to be saved", () => {
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    initRoom("p", room("#efe6d6"), ["1"]);
    expect(getRoomPaint("p").colours["1"]).toEqual(green);
  });

  it("sends nothing when nothing is waiting", async () => {
    initRoom("p", room(), ["1"]);
    await flush("p");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("keeps the selection on a wall being painted — not one taken out of the plan", () => {
    initRoom("p", room(), ["1", "2"]);
    expect(getRoomPaint("p").selected).toBe("1");
    initRoom("p", room(), ["2", "1"]);
    expect(getRoomPaint("p").selected).toBe("1");
    // Wall 1 switched off on C9: the selection moves to a wall still being painted.
    initRoom("p", room(), ["2"]);
    expect(getRoomPaint("p").selected).toBe("2");
  });

  it("reads saved colours the way it is told (the shade found again), with pending taps winning", () => {
    const read = jest.fn((r: { id: number; appliedHexCode?: string | null }) =>
      r.appliedHexCode ? { hex: r.appliedHexCode, code: "HV0001", lrv: 72 } : null,
    );
    initRoom("p", room("#efe6d6"), ["1"], read);
    expect(getRoomPaint("p").colours["1"]).toEqual({ hex: "#efe6d6", code: "HV0001", lrv: 72 });
    applyColours("p", { "1": green });
    initRoom("p", room("#efe6d6"), ["1"], read);
    expect(getRoomPaint("p").colours["1"]).toEqual(green);
  });

  it("stops sending colours the server refuses for good, and says why", async () => {
    const invalidate = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    mockSave.mockRejectedValue(new ApiError("http", 402, "This room's access has ended."));
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    await jest.advanceTimersByTimeAsync(600);
    expect(getRoomPaint("p").refused).toBe("This room's access has ended.");
    expect(getRoomPaint("p").pending).toEqual({});
    // The wall shows its saved colour again, not the one that was refused.
    expect(getRoomPaint("p").colours["1"]).toBeNull();
    expect(getRoomPaint("p").saveFailed).toBe(false);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["me", "projects", "p"], exact: true });
    // Not sent again every few seconds.
    await jest.advanceTimersByTimeAsync(60_000);
    expect(mockSave).toHaveBeenCalledTimes(1);
    invalidate.mockRestore();
  });

  it("keeps trying when the server is only unreachable or busy", async () => {
    mockSave.mockRejectedValueOnce(new ApiError("http", 503, "Busy"));
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    await jest.advanceTimersByTimeAsync(600);
    expect(getRoomPaint("p").saveFailed).toBe(true);
    expect(getRoomPaint("p").refused).toBeNull();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(mockSave).toHaveBeenCalledTimes(2);
  });

  it("sends nothing more for a room that was deleted", async () => {
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    forgetRoom("p");
    await jest.advanceTimersByTimeAsync(60_000);
    expect(mockSave).not.toHaveBeenCalled();
    expect(getRoomPaint("p").pending).toEqual({});
  });

  it("doesn't bring a deleted room back when its last save answers late", async () => {
    let answer: () => void = () => {};
    mockSave.mockReturnValueOnce(new Promise<void>((resolve) => (answer = resolve)));
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    await jest.advanceTimersByTimeAsync(600);
    forgetRoom("p");
    answer();
    await jest.advanceTimersByTimeAsync(0);
    expect(getRoomPaint("p").colours).toEqual({});
  });

  it("sends what is waiting as soon as the app goes to the background", async () => {
    initRoom("p", room(), ["1"]);
    applyColours("p", { "1": green });
    appGoes("background");
    await jest.advanceTimersByTimeAsync(0);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it("clears a colour with nulls", () => {
    expect(saveRows({ "3": null })).toEqual([{ regionId: 3, shadeCode: null, hexCode: null }]);
  });
});
