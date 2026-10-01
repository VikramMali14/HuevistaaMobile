import { ApiError } from "@/api/errors";

import { createTokenManager, type TokenPair } from "../token-manager";
import type { TokenStore } from "../token-store";

function memoryStore(initial: { accessToken: string | null; refreshToken: string | null }): TokenStore {
  let saved = { ...initial };
  return {
    read: async () => ({ ...saved }),
    write: async (accessToken, refreshToken) => {
      saved = { accessToken, refreshToken };
    },
    clear: async () => {
      saved = { accessToken: null, refreshToken: null };
    },
    readDeviceToken: async () => null,
    writeDeviceToken: async () => {},
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createTokenManager", () => {
  it("loads saved tokens", async () => {
    const tm = createTokenManager({
      store: memoryStore({ accessToken: "a1", refreshToken: "r1" }),
      fetchRefresh: jest.fn(),
    });
    expect(tm.hasSession()).toBe(false);
    await tm.load();
    expect(tm.accessToken).toBe("a1");
    expect(tm.hasSession()).toBe(true);
  });

  it("refreshes once for any number of simultaneous callers", async () => {
    const pending = deferred<TokenPair>();
    const fetchRefresh = jest.fn(() => pending.promise);
    const tm = createTokenManager({
      store: memoryStore({ accessToken: "a1", refreshToken: "r1" }),
      fetchRefresh,
    });
    await tm.load();

    const calls = [tm.refreshOnce(), tm.refreshOnce(), tm.refreshOnce()];
    pending.resolve({ accessToken: "a2", refreshToken: "r2" });

    await expect(Promise.all(calls)).resolves.toEqual(["a2", "a2", "a2"]);
    expect(fetchRefresh).toHaveBeenCalledTimes(1);
    expect(fetchRefresh).toHaveBeenCalledWith("r1");
    expect(tm.accessToken).toBe("a2");
  });

  it("uses the rotated refresh token on the next refresh", async () => {
    const fetchRefresh = jest
      .fn<Promise<TokenPair>, [string]>()
      .mockResolvedValueOnce({ accessToken: "a2", refreshToken: "r2" })
      .mockResolvedValueOnce({ accessToken: "a3", refreshToken: "r3" });
    const tm = createTokenManager({
      store: memoryStore({ accessToken: "a1", refreshToken: "r1" }),
      fetchRefresh,
    });
    await tm.load();

    await tm.refreshOnce();
    await tm.refreshOnce();
    expect(fetchRefresh.mock.calls.map(([token]) => token)).toEqual(["r1", "r2"]);
  });

  it("ends the session when the refresh token is refused", async () => {
    const tm = createTokenManager({
      store: memoryStore({ accessToken: "a1", refreshToken: "r1" }),
      fetchRefresh: jest.fn().mockRejectedValue(new ApiError("http", 400, "Refresh token expired")),
    });
    await tm.load();
    const ended = jest.fn();
    tm.onSessionEnded(ended);

    await expect(tm.refreshOnce()).resolves.toBeNull();
    expect(tm.hasSession()).toBe(false);
    expect(tm.accessToken).toBeNull();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("keeps the session when the refresh fails for lack of a network", async () => {
    const tm = createTokenManager({
      store: memoryStore({ accessToken: "a1", refreshToken: "r1" }),
      fetchRefresh: jest.fn().mockRejectedValue(new ApiError("network", 0, "offline")),
    });
    await tm.load();
    const ended = jest.fn();
    tm.onSessionEnded(ended);

    await expect(tm.refreshOnce()).rejects.toMatchObject({ kind: "network" });
    expect(tm.hasSession()).toBe(true);
    expect(ended).not.toHaveBeenCalled();
  });
});
