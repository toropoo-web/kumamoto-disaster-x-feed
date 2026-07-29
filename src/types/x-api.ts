export type XApiErrorCode =
  | "AUTHENTICATION_ERROR"
  | "ACCESS_DENIED"
  | "USER_NOT_FOUND"
  | "USER_LOOKUP_ERROR"
  | "RATE_LIMITED"
  | "X_API_SERVER_ERROR"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE";

export type XApiFailureStage =
  | "user_lookup"
  | "timeline_fetch"
  | "json_parse"
  | "response_validation";

export type XApiConfig = {
  bearerToken: string;
  baseUrl: string;
  maxResults: number;
  requestDelayMs: number;
  initialLookbackHours: number;
  maxPagesPerSource: number;
  fetchImpl?: typeof fetch;
};

export class XApiError extends Error {
  readonly code: XApiErrorCode;
  readonly status?: number;
  readonly rateLimitResetAt?: string;
  readonly failureStage?: XApiFailureStage;
  readonly responseShape?: string;
  readonly apiErrorTitle?: string;

  constructor(
    code: XApiErrorCode,
    message: string,
    options?: {
      status?: number;
      rateLimitResetAt?: string;
      failureStage?: XApiFailureStage;
      responseShape?: string;
      apiErrorTitle?: string;
    }
  ) {
    super(message);
    this.name = "XApiError";
    this.code = code;
    this.status = options?.status;
    this.rateLimitResetAt = options?.rateLimitResetAt;
    this.failureStage = options?.failureStage;
    this.responseShape = options?.responseShape;
    this.apiErrorTitle = options?.apiErrorTitle;
  }
}

export function loadXApiConfigFromEnv(): XApiConfig | null {
  const bearerToken = process.env.X_API_BEARER_TOKEN?.trim();
  if (!bearerToken) return null;

  return {
    bearerToken,
    baseUrl: (
      process.env.X_API_BASE_URL ?? "https://api.x.com/2"
    ).replace(/\/$/, ""),
    maxResults: parsePositiveInt(process.env.X_FETCH_MAX_RESULTS, 100),
    requestDelayMs: parsePositiveInt(
      process.env.X_FETCH_REQUEST_DELAY_MS,
      500
    ),
    initialLookbackHours: parsePositiveInt(
      process.env.X_INITIAL_LOOKBACK_HOURS,
      72
    ),
    maxPagesPerSource: parsePositiveInt(
      process.env.X_FETCH_MAX_PAGES_PER_SOURCE,
      3
    ),
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}
