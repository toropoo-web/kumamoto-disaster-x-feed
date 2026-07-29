import type { FetchState } from "@/types/post";
import type { OfficialPost } from "@/types/post";
import type { PostProcessingBreakdown } from "@/types/post-processing";

export function createEmptyFetchState(): FetchState {
  return {
    lastAttemptAt: null,
    lastSuccessfulFetchAt: null,
    sourceCount: 0,
    successfulSourceCount: 0,
    failedSourceCount: 0,
    fetchedPostCount: 0,
    acceptedPostCount: 0,
    storedPostCount: 0,
    status: "NOT_RUN",
  };
}

export function buildFetchState(params: {
  now: string;
  sourceCount: number;
  successfulSourceCount: number;
  failedSourceCount: number;
  status: FetchState["status"];
  totals: PostProcessingBreakdown;
  mergedPosts: OfficialPost[];
  previousState: FetchState;
}): FetchState {
  const allSourcesFailed =
    params.successfulSourceCount === 0 && params.failedSourceCount > 0;

  return {
    lastAttemptAt: params.now,
    lastSuccessfulFetchAt: allSourcesFailed
      ? params.previousState.lastSuccessfulFetchAt
      : params.now,
    sourceCount: params.sourceCount,
    successfulSourceCount: params.successfulSourceCount,
    failedSourceCount: params.failedSourceCount,
    fetchedPostCount: params.totals.apiPostCount,
    acceptedPostCount: params.totals.accepted,
    storedPostCount: params.mergedPosts.length,
    status: params.status,
  };
}
