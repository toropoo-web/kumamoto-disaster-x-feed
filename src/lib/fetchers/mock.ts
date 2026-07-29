import type { Source } from "@/types/source";
import type { FetchLatestPostsResult, XPostFetcher } from "./types";
import { createEmptyBreakdown } from "@/types/post-processing";

export class MockXPostFetcher implements XPostFetcher {
  async fetchLatestPosts(_source: Source): Promise<FetchLatestPostsResult> {
    return {
      posts: [],
      newestPostId: null,
      apiPostCount: 0,
      paginationPartial: false,
      breakdown: createEmptyBreakdown(),
    };
  }
}
