import type { XApiConfig, XApiErrorCode, XApiFailureStage } from "@/types/x-api";
import { XApiError } from "@/types/x-api";

export type XSearchUsageCounters = {
  searchRequests: number;
  postsRead: number;
};

export type XSearchUser = {
  id: string;
  username?: string;
  name?: string;
};

export type XSearchTweet = {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  attachments?: { media_keys?: string[] };
  referenced_tweets?: Array<{ type: string; id: string }>;
};

export type XSearchMedia = {
  media_key: string;
  type: "photo" | "video" | "animated_gif";
  url?: string;
  preview_image_url?: string;
};

export type XSearchTweetResponse = {
  data?: XSearchTweet[];
  includes?: {
    users?: XSearchUser[];
    media?: XSearchMedia[];
  };
  meta?: {
    result_count?: number;
    newest_id?: string;
    oldest_id?: string;
    next_token?: string;
  };
  errors?: Array<{
    title?: string;
    detail?: string;
    type?: string;
  }>;
};

export type SearchRecentParams = {
  query: string;
  startTime?: string;
  maxResults?: number;
  paginationToken?: string;
};

const RETRY_DELAYS_MS = [1000, 3000];
const NO_RETRY_CODES: XApiErrorCode[] = [
  "AUTHENTICATION_ERROR",
  "ACCESS_DENIED",
  "RATE_LIMITED",
];

export class XSearchClient {
  private readonly config: XApiConfig;
  private readonly counters: XSearchUsageCounters = {
    searchRequests: 0,
    postsRead: 0,
  };
  private lastRequestAt = 0;

  constructor(config: XApiConfig) {
    this.config = config;
  }

  getUsageCounters(): XSearchUsageCounters {
    return { ...this.counters };
  }

  async searchRecent(params: SearchRecentParams): Promise<XSearchTweetResponse> {
    const search = new URLSearchParams({
      query: params.query,
      max_results: String(params.maxResults ?? this.config.maxResults),
      "tweet.fields":
        "id,text,created_at,author_id,attachments,referenced_tweets,entities,lang",
      expansions: "author_id,attachments.media_keys",
      "user.fields": "username,name",
      "media.fields": "media_key,type,url,preview_image_url",
    });

    if (params.startTime) {
      search.set("start_time", params.startTime);
    }
    if (params.paginationToken) {
      search.set("next_token", params.paginationToken);
    }

    const url = `${this.config.baseUrl}/tweets/search/recent?${search}`;
    const response = await this.request(url);
    const body = (await this.parseJson(response)) as XSearchTweetResponse;

    if (!response.ok) {
      throw this.errorFromResponse(response, body.errors, "timeline_fetch");
    }

    if (body.errors?.length && !body.data?.length) {
      throw this.errorFromResponse(response, body.errors, "timeline_fetch");
    }

    this.counters.searchRequests += 1;
    this.counters.postsRead += body.data?.length ?? 0;
    return body;
  }

  private async request(url: string): Promise<Response> {
    await this.waitForRequestDelay();

    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const response = await this.fetchWithAuth(url);
        if (response.ok) {
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
            { failureStage: "timeline_fetch" }
          );
        }
        await this.sleep(RETRY_DELAYS_MS[attempt]);
      }
    }

    throw new XApiError(
      "NETWORK_ERROR",
      lastError instanceof Error ? lastError.message : "Network request failed",
      { failureStage: "timeline_fetch" }
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

  private async parseJson(response: Response): Promise<unknown> {
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

  private errorFromResponse(
    response: Response,
    errors?: XSearchTweetResponse["errors"],
    stage: XApiFailureStage = "response_validation"
  ): XApiError {
    const status = response.status;
    const first = errors?.[0];
    const detail = first?.detail ?? first?.title ?? `HTTP ${status}`;
    const code = this.mapStatusToCode(status);
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
      responseShape: "search_response",
      apiErrorTitle: first?.title,
    });
  }

  private mapStatusToCode(status: number): XApiErrorCode {
    if (status === 401) return "AUTHENTICATION_ERROR";
    if (status === 402 || status === 403) return "ACCESS_DENIED";
    if (status === 429) return "RATE_LIMITED";
    if (status >= 500) return "X_API_SERVER_ERROR";
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
}

export function buildUserMap(
  users: XSearchUser[] | undefined
): Map<string, XSearchUser> {
  return new Map((users ?? []).map((user) => [user.id, user]));
}

export function hasImage(media?: XSearchMedia[]): boolean {
  return media?.some((item) => item.type === "photo") ?? false;
}

export function hasVideo(media?: XSearchMedia[]): boolean {
  return (
    media?.some(
      (item) => item.type === "video" || item.type === "animated_gif"
    ) ?? false;
  );
}
