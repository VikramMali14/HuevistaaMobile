import { createTokenManager } from "@/auth/token-manager";
import type { TokenStore } from "@/auth/token-store";

import { createApiClient } from "../client";
import { ApiError } from "../errors";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const store: TokenStore = {
  read: async () => ({ accessToken: "old", refreshToken: "r1" }),
  write: async () => {},
  clear: async () => {},
  readDeviceToken: async () => null,
  writeDeviceToken: async () => {},
};

function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchImpl = jest.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)));
  const fetchRefresh = jest.fn(async () => ({ accessToken: "new", refreshToken: "r2" }));
  const tokens = createTokenManager({ store, fetchRefresh });
  const client = createApiClient({
    baseUrl: "https://api.test",
    tokens,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { client, tokens, fetchImpl, fetchRefresh };
}

const authOf = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

describe("createApiClient", () => {
  it("sends JSON with the Bearer token and builds the query string", async () => {
    const { client, tokens, fetchImpl } = setup(() => json(200, { ok: true }));
    await tokens.load();

    await expect(
      client.request("api/nearby/painters", { query: { lat: 18.5, lon: 73.8, skip: undefined } }),
    ).resolves.toEqual({ ok: true });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.test/api/nearby/painters?lat=18.5&lon=73.8");
    expect(authOf(init)).toBe("Bearer old");
  });

  it("refreshes once when two requests hit a 401 together, then retries both", async () => {
    const { client, tokens, fetchImpl, fetchRefresh } = setup((_url, init) =>
      authOf(init) === "Bearer new" ? json(200, { ok: true }) : json(401, { message: "expired" }),
    );
    await tokens.load();

    await expect(Promise.all([client.request("a"), client.request("b")])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(fetchRefresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("does not send a token or refresh for open endpoints", async () => {
    const { client, tokens, fetchImpl, fetchRefresh } = setup(() => json(401, { message: "Bad credentials" }));
    await tokens.load();

    await expect(client.request("api/auth/login", { body: {}, auth: false })).rejects.toMatchObject({
      status: 401,
      message: "Bad credentials",
    });
    expect(authOf(fetchImpl.mock.calls[0]![1])).toBeUndefined();
    expect(fetchRefresh).not.toHaveBeenCalled();
  });

  it("turns an error body into an ApiError with field errors and code", async () => {
    const { client } = setup(() =>
      json(402, { message: "No rooms left", code: "AUTO_MASK_UNAVAILABLE", fieldErrors: { phone: "Bad" } }),
    );
    const err = await client.request("x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: "http", status: 402, code: "AUTO_MASK_UNAVAILABLE", fieldErrors: { phone: "Bad" } });
  });

  it("answers undefined for 204", async () => {
    const { client } = setup(() => new Response(null, { status: 204 }));
    await expect(client.request("x", { method: "PUT", body: [] })).resolves.toBeUndefined();
  });

  it("reports a network failure as kind 'network'", async () => {
    const { client } = setup(() => {
      throw new TypeError("Network request failed");
    });
    await expect(client.request("x")).rejects.toMatchObject({ kind: "network", status: 0 });
  });

  it("turns a garbled JSON answer into an ApiError, not a raw parse error", async () => {
    const { client } = setup(
      () => new Response("<html>proxy error", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    await expect(client.request("x")).rejects.toMatchObject({ kind: "http", status: 200 });
  });

  it("treats a connection dropped mid-answer as a network failure (so it can be retried)", async () => {
    const { client } = setup(() => {
      const res = json(200, { ok: true });
      jest.spyOn(res, "text").mockRejectedValue(new TypeError("Network request failed"));
      return res;
    });
    await expect(client.request("x")).rejects.toMatchObject({ kind: "network" });
  });
});

describe("error messages", () => {
  it("keeps only the message written for people — never the status phrase", async () => {
    const { client } = setup(() => json(400, { status: 400, error: "Bad Request" }));
    await expect(client.request("api/x", { auth: false })).rejects.toMatchObject({ status: 400, message: "" });
  });
});
