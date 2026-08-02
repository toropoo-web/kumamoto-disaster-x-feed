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
    lastHttpStatus: null,
    consecutiveFailures: 0,
    successfulSources: [],
    failedSources: [],
    failureReason: null,
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
  monitoring?: Pick<
    FetchState,
    | "lastHttpStatus"
    | "consecutiveFailures"
    | "successfulSources"
    | "failedSources"
    | "failureReason"
  >;
}): FetchState {
  const allSourcesFailed =
    params.successfulSourceCount === 0 && params.failedSourceCount > 0;
  const monitoring = params.monitoring ?? {
    lastHttpStatus: params.previousState.lastHttpStatus ?? null,
    consecutiveFailures: allSourcesFailed
      ? (params.previousState.consecutiveFailures ?? 0) + 1
      : params.status === "SUCCESS" || params.status === "PARTIAL"
        ? 0
        : (params.previousState.consecutiveFailures ?? 0),
    successfulSources: params.previousState.successfulSources ?? [],
    failedSources: params.previousState.failedSources ?? [],
    failureReason: allSourcesFailed ? "ALL_SOURCES_FAILED" : null,
  };

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
    ...monitoring,
  };
}
