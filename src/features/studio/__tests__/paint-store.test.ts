import type { RoomDetail } from "@/api/types";

const mockSave = jest.fn();
jest.mock("@/api/endpoints/projects", () => ({ projectsApi: { saveColours: (...a: unknown[]) => mockSave(...a) } }));

// eslint-disable-next-line import/first -- after the mock above
import { applyColours, flush, getRoomPaint, initRoom, resetPaintStore, saveRows, undo } from "../paint-store";

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
    initRoom("p", room("#efe6d6"), "1");
    expect(getRoomPaint("p").colours["1"]).toEqual({ hex: "#efe6d6", code: "HV0001" });
    expect(getRoomPaint("p").colours["2"]).toBeNull();
    expect(getRoomPaint("p").selected).toBe("1");
  });

  it("saves once, 600 ms after the last change, with every wall that changed", async () => {
    initRoom("p", room(), "1");
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
    initRoom("p", room(), "1");
    applyColours("p", { "1": green });
    applyColours("p", { "1": { ...green } });
    expect(getRoomPaint("p").history).toHaveLength(1);
  });

  it("undoes the last change and saves the colouring before it", async () => {
    initRoom("p", room(), "1");
    applyColours("p", { "1": green });
    await jest.advanceTimersByTimeAsync(600);
    applyColours("p", { "1": grey });
    undo("p");
    expect(getRoomPaint("p").colours["1"]).toEqual(green);
    await jest.advanceTimersByTimeAsync(600);
    expect(mockSave).toHaveBeenLastCalledWith("p", [{ regionId: 1, shadeCode: "HV0118", hexCode: "#7b8a72" }]);
  });

  it("keeps a change that failed to save, says so, and tries again", async () => {
    mockSave.mockRejectedValueOnce(new Error("offline"));
    initRoom("p", room(), "1");
    applyColours("p", { "1": green });
    await jest.advanceTimersByTimeAsync(600);
    expect(getRoomPaint("p").saveFailed).toBe(true);
    expect(getRoomPaint("p").pending).toEqual({ "1": green });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(getRoomPaint("p").saveFailed).toBe(false);
  });

  it("never lets a refetch undo a tap that is still waiting to be saved", () => {
    initRoom("p", room(), "1");
    applyColours("p", { "1": green });
    initRoom("p", room("#efe6d6"), "1");
    expect(getRoomPaint("p").colours["1"]).toEqual(green);
  });

  it("sends nothing when nothing is waiting", async () => {
    initRoom("p", room(), "1");
    await flush("p");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("clears a colour with nulls", () => {
    expect(saveRows({ "3": null })).toEqual([{ regionId: 3, shadeCode: null, hexCode: null }]);
  });
});
