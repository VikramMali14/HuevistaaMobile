import { act, renderHook } from "@testing-library/react-native";

import { usePullToRefresh } from "../use-pull-to-refresh";

describe("usePullToRefresh", () => {
  it("is not refreshing until pulled — whatever the queries do on their own", () => {
    const { result } = renderHook(() => usePullToRefresh(() => undefined));
    expect(result.current.refreshing).toBe(false);
  });

  it("spins for the pull and stops when the reload settles", async () => {
    let finish!: () => void;
    const refresh = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result } = renderHook(() => usePullToRefresh(refresh));
    act(() => result.current.onRefresh());
    expect(result.current.refreshing).toBe(true);
    await act(async () => {
      await Promise.resolve();
      finish();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(false);
  });

  it("stops spinning when the reload fails", async () => {
    const { result } = renderHook(() => usePullToRefresh(() => Promise.reject(new Error("offline"))));
    await act(async () => {
      result.current.onRefresh();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.refreshing).toBe(false);
  });
});
