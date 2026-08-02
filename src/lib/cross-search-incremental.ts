import {
  CROSS_SEARCH_SINCE_DATE,
  type CrossSearchBatchFetchState,
  type CrossSearchFetchState,
} from "@/types/cross-search-post";

/** Overlap window to avoid missing posts across scheduled runs. */
export const CROSS_SEARCH_START_TIME_OVERLAP_MS = 5 * 60 * 1000;

export function createEmptyBatchState(
  batchId: string
): CrossSearchBatchFetchState {
  return {
    lastBatchId: batchId,
    lastSuccessfulSearchAt: null,
    nextStartTime: null,
    lastNewestPostId: null,
    fetchedCount: 0,
    acceptedCount: 0,
    storedCount: 0,
    consecutiveFailures: 0,
  };
}

export function subtractOverlap(isoTime: string): string {
  const base = new Date(isoTime);
  if (Number.isNaN(base.getTime())) {
    return CROSS_SEARCH_SINCE_DATE;
  }
  return new Date(
    base.getTime() - CROSS_SEARCH_START_TIME_OVERLAP_MS
  ).toISOString();
}

export function buildNextStartTime(lastSuccessfulSearchAt: string): string {
  return subtractOverlap(lastSuccessfulSearchAt);
}

export function resolveBatchStartTime(
  batchId: string,
  batchState: CrossSearchBatchFetchState | undefined,
  globalState: CrossSearchFetchState
): string {
  if (batchState?.nextStartTime) {
    return batchState.nextStartTime;
  }
  if (batchState?.lastSuccessfulSearchAt) {
    return buildNextStartTime(batchState.lastSuccessfulSearchAt);
  }
  if (globalState.lastSuccessfulFetchAt) {
    return buildNextStartTime(globalState.lastSuccessfulFetchAt);
  }
  return CROSS_SEARCH_SINCE_DATE;
}

export function getBatchState(
  state: CrossSearchFetchState,
  batchId: string
): CrossSearchBatchFetchState {
  return state.batches?.[batchId] ?? createEmptyBatchState(batchId);
}

export function applyBatchSuccess(input: {
  batchId: string;
  previous: CrossSearchBatchFetchState;
  successfulAt: string;
  fetchedCount: number;
  acceptedCount: number;
  storedCount: number;
  lastNewestPostId: string | null;
}): CrossSearchBatchFetchState {
  return {
    lastBatchId: input.batchId,
    lastSuccessfulSearchAt: input.successfulAt,
    nextStartTime: buildNextStartTime(input.successfulAt),
    lastNewestPostId: input.lastNewestPostId,
    fetchedCount: input.previous.fetchedCount + input.fetchedCount,
    acceptedCount: input.previous.acceptedCount + input.acceptedCount,
    storedCount: input.storedCount,
    consecutiveFailures: 0,
  };
}

export function applyBatchFailure(
  batchId: string,
  previous: CrossSearchBatchFetchState
): CrossSearchBatchFetchState {
  return {
    ...previous,
    lastBatchId: batchId,
    consecutiveFailures: previous.consecutiveFailures + 1,
  };
}

export function normalizeCrossSearchFetchState(
  state: CrossSearchFetchState,
  batchIds: string[]
): CrossSearchFetchState {
  const batches: Record<string, CrossSearchBatchFetchState> = {
    ...(state.batches ?? {}),
  };

  batchIds.forEach(function (batchId) {
    if (batches[batchId]) {
      return;
    }
    if (state.lastSuccessfulFetchAt) {
      batches[batchId] = {
        ...createEmptyBatchState(batchId),
        lastSuccessfulSearchAt: state.lastSuccessfulFetchAt,
        nextStartTime: buildNextStartTime(state.lastSuccessfulFetchAt),
      };
      return;
    }
    batches[batchId] = createEmptyBatchState(batchId);
  });

  return {
    ...state,
    batches,
  };
}

export function countDuplicateIncomingPosts(
  existing: Array<{ postId: string }>,
  incoming: Array<{ postId: string }>
): number {
  const existingIds = new Set(
    existing.map(function (post) {
      return post.postId;
    })
  );
  return incoming.filter(function (post) {
    return existingIds.has(post.postId);
  }).length;
}

/**
 * Search Recent does not accept since_id. Incremental fetch uses rolling start_time.
 */
export function resolveIncrementalSearchStrategy(): "start_time_overlap" {
  return "start_time_overlap";
}
