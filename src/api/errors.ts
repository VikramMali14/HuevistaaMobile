import { t } from "@/i18n";

export type ApiErrorKind = "http" | "network" | "timeout";

/** Every failed API call throws one of these. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status; 0 when the request never got an answer. */
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;
  readonly code?: string;

  constructor(
    kind: ApiErrorKind,
    status: number,
    message: string,
    fieldErrors?: Record<string, string>,
    code?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.code = code;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** True when trying again might work: no answer, a timeout, rate limiting or a 5xx. */
export function isRetryable(err: unknown): boolean {
  if (!isApiError(err)) return false;
  return err.kind !== "http" || err.status === 429 || err.status >= 500;
}

/**
 * The sentence to show a person for a failed call.
 *
 * The backend writes its 4xx messages for people ("Please upload a photo of an indoor
 * room…"), and the website shows them as they are — so do we. A 5xx message may be
 * technical, so it is never shown. A raw status code is never shown.
 */
export function messageFor(err: unknown, fallback: string = t("errors.generic")): string {
  if (!isApiError(err)) return fallback;
  if (err.kind === "network") return t("errors.network");
  if (err.kind === "timeout") return t("errors.timeout");
  if (err.status === 401) return t("errors.sessionEnded");
  if (err.status === 429) return t("errors.tooMany");
  if (err.status >= 500) return t("errors.server");
  return err.message || fallback;
}
