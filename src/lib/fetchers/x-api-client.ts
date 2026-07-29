import type { XApiConfig, XApiErrorCode, XApiFailureStage } from "@/types/x-api";
import { XApiError } from "@/types/x-api";

export type XApiUsageCounters = {
  userLookupRequests: number;
  timelineRequests: number;
  postsRead: number;
};

export type XApiErrorItem = {
  title?: string;
  detail?: string;
  type?: string;
  resource_type?: string;
  parameter?: string;
  value?: string;
};

export type XApiTweetResponse = {
  data?: XApiTweet[];
  includes?: {
    media?: XApiMedia[];
  };
  meta?: {
    result_count?: number;
    newest_id?: string;
    oldest_id?: string;
    next_token?: string;
  };
  errors?: XApiErrorItem[];
};

export type XApiTweet = {
  id: string;
  text: string;
  created_at?: string;
  lang?: string;
  attachments?: { media_keys?: string[] };
  referenced_tweets?: Array<{ type: string; id: string }>;
};

export type XApiMedia = {
  media_key: string;
  type: "photo" | "video" | "animated_gif";
  url?: string;
  preview_image_url?: string;
};

export type XApiUserLookupResponse = {
  data?: { id: string; username?: string; name?: string };
  errors?: XApiErrorItem[];
};

const RETRY_DELAYS_MS = [1000, 3000];
const NO_RETRY_CODES: XApiErrorCode[] = [
  "AUTHENTICATION_ERROR",
  "ACCESS_DENIED",
  "USER_NOT_FOUND",
  "USER_LOOKUP_ERROR",
  "RATE_LIMITED",
];

export class XApiClient {
  private readonly config: XApiConfig;
  private readonly counters: XApiUsageCounters = {
    userLookupRequests: 0,
    timelineRequests: 0,
    postsRead: 0,
  };
  private lastRequestAt = 0;

  constructor(config: XApiConfig) {
    this.config = config;
  }

  getUsageCounters(): XApiUsageCounters {
    return { ...this.counters };
  }

  async lookupUserId(username: string): Promise<string> {
    const normalized = username.replace(/^@/, "").trim();
    const url = `${this.config.baseUrl}/users/by/username/${encodeURIComponent(normalized)}`;
    const response = await this.request(url, "userLookup");
    const body = (await this.parseJson(
      response,
      "user_lookup"
    )) as XApiUserLookupResponse;

    if (!response.ok) {
      throw this.errorFromResponse(response, body.errors, "user_lookup");
    }

    if (body.errors?.length) {
      throw this.userLookupErrorFromBody(body, response.status);
    }

    if (!body.data?.id) {
      throw new XApiError("INVALID_RESPONSE", "User lookup returned no data", {
        status: response.status,
        failureStage: "response_validation",
        responseShape: describeResponseShape(body),
      });
    }

    return body.data.id;
  }

  async fetchUserTweets(params: {
    userId: string;
    sinceId?: string | null;
    startTime?: string | null;
    paginationToken?: string;
  }): Promise<XApiTweetResponse> {
    const search = new URLSearchParams({
      max_results: String(this.config.maxResults),
      exclude: "replies,retweets",
      "tweet.fields":
        "id,text,created_at,attachments,referenced_tweets,entities,lang",
      expansions: "attachments.media_keys",
      "media.fields": "media_key,type,url,preview_image_url",
    });

    if (params.sinceId) {
      search.set("since_id", params.sinceId);
    } else if (params.startTime) {
      search.set("start_time", params.startTime);
    }

    if (params.paginationToken) {
      search.set("pagination_token", params.paginationToken);
    }

    const url = `${this.config.baseUrl}/users/${params.userId}/tweets?${search}`;
    const response = await this.request(url, "timeline");
    const body = (await this.parseJson(
      response,
      "timeline_fetch"
    )) as XApiTweetResponse;

    if (!response.ok) {
      throw this.errorFromResponse(response, body.errors, "timeline_fetch");
    }

    if (body.errors?.length && !body.data?.length) {
      throw this.errorFromResponse(response, body.errors, "timeline_fetch");
    }

    this.counters.postsRead += body.data?.length ?? 0;
    return body;
  }

  private async request(
    url: string,
    kind: "userLookup" | "timeline"
  ): Promise<Response> {
    await this.waitForRequestDelay();

    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const response = await this.fetchWithAuth(url);
        if (response.ok) {
          if (kind === "userLookup") this.counters.userLookupRequests += 1;
          if (kind === "timeline") this.counters.timelineRequests += 1;
          return response;
        }

        if (
          !this.isRetryableStatus(response.status) ||
          attempt === RETRY_DELAYS_MS.length
        ) {
          return response;
        }

        await this.sleep(RETRY_DELAYS_MS[attempt]);
      } catch (error) {
        lastError = error;
        if (attempt === RETRY_DELAYS_MS.length) {
          throw new XApiError(
            "NETWORK_ERROR",
            error instanceof Error ? error.message : "Network request failed",
            { failureStage: kind === "userLookup" ? "user_lookup" : "timeline_fetch" }
          );
        }
        await this.sleep(RETRY_DELAYS_MS[attempt]);
      }
    }

    throw new XApiError(
      "NETWORK_ERROR",
      lastError instanceof Error ? lastError.message : "Network request failed",
      { failureStage: kind === "userLookup" ? "user_lookup" : "timeline_fetch" }
    );
  }

  private async fetchWithAuth(url: string): Promise<Response> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    return fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.config.bearerToken}`,
        Accept: "application/json",
      },
    });
  }

  private async parseJson(
    response: Response,
    stage: XApiFailureStage
  ): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new XApiError("INVALID_RESPONSE", "Failed to parse X API response", {
        status: response.status,
        failureStage: "json_parse",
        responseShape: "non-json",
      });
    }
  }

  private userLookupErrorFromBody(
    body: XApiUserLookupResponse,
    status: number
  ): XApiError {
    const first = body.errors?.[0];
    const detail = summarizeErrorDetail(first);
    const isNotFound =
      first?.title?.toLowerCase().includes("not found") ||
      first?.detail?.toLowerCase().includes("could not find user") ||
      first?.type?.includes("resource-not-found");

    return new XApiError(
      isNotFound ? "USER_NOT_FOUND" : "USER_LOOKUP_ERROR",
      detail,
      {
        status,
        failureStage: "user_lookup",
        responseShape: describeResponseShape(body),
        apiErrorTitle: first?.title,
      }
    );
  }

  private errorFromResponse(
    response: Response,
    errors?: XApiErrorItem[],
    stage: XApiFailureStage = "response_validation"
  ): XApiError {
    const status = response.status;
    const first = errors?.[0];
    const detail = summarizeErrorDetail(first) || `HTTP ${status}`;
    const code = this.mapStatusToCode(status, stage, first);
    const resetHeader = response.headers.get("x-rate-limit-reset");
    const rateLimitResetAt =
      code === "RATE_LIMITED" && resetHeader
        ? new Date(Number(resetHeader) * 1000).toISOString()
        : code === "RATE_LIMITED"
          ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
          : undefined;

    return new XApiError(code, detail, {
      status,
      rateLimitResetAt,
      failureStage: stage,
      responseShape: describeResponseShape({ errors }),
      apiErrorTitle: first?.title,
    });
  }

  private mapStatusToCode(
    status: number,
    stage: XApiFailureStage,
    error?: XApiErrorItem
  ): XApiErrorCode {
    if (status === 401) return "AUTHENTICATION_ERROR";
    if (status === 402) return "ACCESS_DENIED";
    if (status === 403) return "ACCESS_DENIED";
    if (status === 404) {
      return stage === "user_lookup" ? "USER_NOT_FOUND" : "INVALID_RESPONSE";
    }
    if (status === 429) return "RATE_LIMITED";
    if (status >= 500) return "X_API_SERVER_ERROR";
    if (
      stage === "user_lookup" &&
      error?.type?.includes("resource-not-found")
    ) {
      return "USER_NOT_FOUND";
    }
    return "INVALID_RESPONSE";
  }

  private isRetryableStatus(status: number): boolean {
    return status >= 500;
  }

  shouldNotRetry(code: XApiErrorCode): boolean {
    return NO_RETRY_CODES.includes(code);
  }

  private async waitForRequestDelay(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    const waitMs = this.config.requestDelayMs - elapsed;
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
    this.lastRequestAt = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  logRateLimit(error: XApiError): void {
    if (error.code !== "RATE_LIMITED") return;
    console.error(
      `Rate limited. Retry after approximately: ${error.rateLimitResetAt ?? "unknown"}`
    );
  }
}

export function describeResponseShape(body: unknown): string {
  if (!body || typeof body !== "object") return "unknown";
  const keys = Object.keys(body as Record<string, unknown>).sort();
  const parts = [`keys: ${keys.join(",")}`];
  const record = body as Record<string, unknown>;
  parts.push(`has_data: ${record.data !== undefined}`);
  parts.push(`has_errors: ${Array.isArray(record.errors) && record.errors.length > 0}`);
  parts.push(`has_meta: ${record.meta !== undefined}`);
  return parts.join("; ");
}

export function summarizeErrorDetail(error?: XApiErrorItem): string {
  if (!error) return "";
  const detail = error.detail ?? error.title ?? "";
  return detail.slice(0, 120);
}
