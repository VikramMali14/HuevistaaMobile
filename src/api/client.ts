import type { TokenManager } from "@/auth/token-manager";

import { ApiError } from "./errors";
import type { ErrorBody } from "./types";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: Method;
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as multipart/form-data (uploads). Takes precedence over `body`. */
  form?: FormData;
  query?: Record<string, QueryValue>;
  /** Send the Bearer token and refresh on 401. Default true. */
  auth?: boolean;
  /** Default 20 s. Give uploads more. */
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
}

export interface ApiClientDeps {
  baseUrl: string;
  tokens: Pick<TokenManager, "accessToken" | "hasSession" | "refreshOnce">;
  fetchImpl?: typeof fetch;
  defaultTimeoutMs?: number;
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const url = `${baseUrl}/${path.replace(/^\/+/, "")}`;
  if (!query) return url;
  const pairs = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length ? `${url}?${pairs.join("&")}` : url;
}

async function readError(res: Response): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = (await res.json()) as ErrorBody;
  } catch {
    // Not JSON — a proxy page or an empty body.
  }
  // Only `message` is written for people. `error` is the status phrase ("Bad Request"),
  // and a made-up "Request failed (400)" would reach the screen — so with no message the
  // error carries none, and messageFor() says something in the app's own words.
  const message = typeof body.message === "string" ? body.message.trim() : "";
  return new ApiError("http", res.status, message, body.fieldErrors, body.code);
}

async function readBody<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    // The connection dropped part-way through the answer.
    throw new ApiError("network", res.status, err instanceof Error ? err.message : "Connection lost");
  }
  if (!text) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) return text as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Truncated, or a proxy's page wearing a JSON content type.
    throw new ApiError("http", res.status, "The server's answer could not be read");
  }
}

export function createApiClient(deps: ApiClientDeps): ApiClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const defaultTimeout = deps.defaultTimeoutMs ?? 20_000;

  async function send(path: string, options: RequestOptions, token: string | null) {
    const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
    let body: BodyInit | undefined;
    if (options.form) {
      body = options.form;
    } else if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? defaultTimeout);
    try {
      return await fetchImpl(buildUrl(deps.baseUrl, path, options.query), {
        method: options.method ?? (body ? "POST" : "GET"),
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) throw new ApiError("timeout", 0, "Request timed out");
      throw new ApiError("network", 0, err instanceof Error ? err.message : "Network error");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
      const useAuth = options.auth !== false;
      const used = useAuth ? deps.tokens.accessToken : null;
      let res = await send(path, options, used);

      if (res.status === 401 && useAuth && deps.tokens.hasSession()) {
        // Another request may already have refreshed while this one was in flight —
        // then just retry with the new token instead of refreshing a second time.
        const current = deps.tokens.accessToken;
        const fresh = current && current !== used ? current : await deps.tokens.refreshOnce();
        if (fresh) res = await send(path, options, fresh);
      }

      if (!res.ok) throw await readError(res);
      return readBody<T>(res);
    },
  };
}
