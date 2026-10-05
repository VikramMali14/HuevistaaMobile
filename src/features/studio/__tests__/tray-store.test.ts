import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook } from "@testing-library/react-native";

import { forgetTray, removeCombo, reorderTray, resetTrays, saveCombo, useTray } from "../tray-store";

const walls = ["11", "12"];
const blue = { "11": { hex: "#3e4a52", code: "HV0124" } };
const green = { "11": { hex: "#7b8a72", code: "HV0118" } };

beforeEach(() => {
  resetTrays();
});

describe("the board tray", () => {
  it("keeps each combination once, and only painted walls", () => {
    expect(saveCombo("p1", { ...blue, "99": { hex: "#000000", code: null } }, walls)).toBe(true);
    expect(saveCombo("p1", blue, walls)).toBe(false);
    expect(saveCombo("p1", {}, walls)).toBe(false);
    const { result } = renderHook(() => useTray("p1"));
    expect(result.current.map((c) => c.colours)).toEqual([blue]);
  });

  it("names every combination differently, even two in the same millisecond", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
    saveCombo("p1", blue, walls);
    saveCombo("p1", green, walls);
    now.mockRestore();
    const { result } = renderHook(() => useTray("p1"));
    expect(new Set(result.current.map((c) => c.savedAt)).size).toBe(2);
  });

  it("takes one off, puts them in order, and is kept on the phone", async () => {
    saveCombo("p1", blue, walls);
    saveCombo("p1", green, walls);
    const { result } = renderHook(() => useTray("p1"));
    const [first, second] = result.current;

    act(() => reorderTray("p1", [second!, first!]));
    expect(result.current.map((c) => c.colours)).toEqual([green, blue]);

    act(() => removeCombo("p1", second!.savedAt));
    expect(result.current.map((c) => c.colours)).toEqual([blue]);
    const stored = JSON.parse((await AsyncStorage.getItem("hv.boardTrays")) ?? "{}");
    expect(stored.p1.map((c: { colours: unknown }) => c.colours)).toEqual([blue]);

    act(() => forgetTray("p1"));
    expect(result.current).toEqual([]);
    expect(JSON.parse((await AsyncStorage.getItem("hv.boardTrays")) ?? "{}")).toEqual({});
  });
});
