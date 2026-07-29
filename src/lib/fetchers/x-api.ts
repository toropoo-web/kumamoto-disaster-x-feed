import type { SourceRuntimeState } from "@/types/source-runtime";
import type { Source } from "@/types/source";
import type { XApiConfig } from "@/types/x-api";
import { XApiError } from "@/types/x-api";
import type { PostProcessingBreakdown } from "@/types/post-processing";
import { createEmptyBreakdown, mergeBreakdowns } from "@/types/post-processing";
import type { FetchLatestPostsResult } from "./types";
import { XApiClient } from "./x-api-client";
import {
  dedupeRawPostsWithStats,
  getNewestPostIdFromResponse,
  processTweetResponse,
} from "./x-api-mapper";

export class XApiPostFetcher {
  private readonly client: XApiClient;
  private readonly config: XApiConfig;

  constructor(config: XApiConfig) {
    this.config = config;
    this.client = new XApiClient(config);
  }

  getUsageCounters() {
    return this.client.getUsageCounters();
  }

  async resolveUserId(
    source: Source,
    runtimeState?: SourceRuntimeState
  ): Promise<string> {
    if (runtimeState?.xUserId) return runtimeState.xUserId;
    if (source.xUserId) return source.xUserId;
    if (!source.accountHandle?.trim()) {
      throw new XApiError(
        "INVALID_RESPONSE",
        `Source ${source.sourceId} has no account handle`,
        { failureStage: "user_lookup" }
      );
    }

    return this.client.lookupUserId(source.accountHandle);
  }

  async fetchLatestPosts(
    source: Source,
    runtimeState?: SourceRuntimeState
  ): Promise<FetchLatestPostsResult> {
    const userId = await this.resolveUserId(source, runtimeState);
    const sinceId = runtimeState?.lastSeenPostId ?? null;
    const startTime =
      sinceId === null ? this.buildInitialStartTime() : null;

    const collected: FetchLatestPostsResult["posts"] = [];
    const pageBreakdowns: PostProcessingBreakdown[] = [];
    const seenTokens = new Set<string>();
    let newestPostId: string | null = null;
    let apiPostCount = 0;
    let paginationPartial = false;
    let nextToken: string | undefined;

    for (let page = 0; page < this.config.maxPagesPerSource; page += 1) {
      const response = await this.client.fetchUserTweets({
        userId,
        sinceId,
        startTime: page === 0 ? startTime : null,
        paginationToken: nextToken,
      });

      const processed = processTweetResponse(response, userId);
      pageBreakdowns.push(processed.breakdown);
      apiPostCount += processed.breakdown.apiPostCount;
      collected.push(...processed.posts);

      const pageNewest = getNewestPostIdFromResponse(response, processed.posts);
      if (
        pageNewest &&
        (!newestPostId || BigInt(pageNewest) > BigInt(newestPostId))
      ) {
        newestPostId = pageNewest;
      }

      const token = response.meta?.next_token;
      if (!token) break;

      if (seenTokens.has(token)) {
        paginationPartial = true;
        break;
      }
      seenTokens.add(token);

      if (page === this.config.maxPagesPerSource - 1) {
        paginationPartial = true;
        break;
      }

      nextToken = token;
    }

    const { posts: deduped, duplicateCount } = dedupeRawPostsWithStats(collected);
    const breakdown = mergeBreakdowns(...pageBreakdowns);
    breakdown.rejectedDuplicate += duplicateCount;

    return {
      posts: deduped,
      newestPostId: newestPostId ?? getNewestFromPosts(deduped),
      apiPostCount,
      paginationPartial,
      breakdown,
    };
  }

  private buildInitialStartTime(): string {
    const ms = this.config.initialLookbackHours * 60 * 60 * 1000;
    return new Date(Date.now() - ms).toISOString();
  }
}

function getNewestFromPosts(
  posts: FetchLatestPostsResult["posts"]
): string | null {
  if (posts.length === 0) return null;
  return posts
    .map((post) => post.id)
    .sort((a, b) => (BigInt(a) > BigInt(b) ? -1 : 1))[0];
}
