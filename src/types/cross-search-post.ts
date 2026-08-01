import type { PostStatus } from "@/types/post";

export const CROSS_SEARCH_ACQUISITION_MODE = "SEARCH_CROSS" as const;
export const CROSS_SEARCH_SINCE_DATE = "2026-07-28T00:00:00Z";

export type CrossSearchPost = {
  postId: string;
  postUrl: string;
  postedAt: string;
  fetchedAt: string;
  title: string;
  summary: string;
  content: string;
  accountHandle: string;
  authorDisplayName?: string;
  regions: string[];
  status: PostStatus;
  acquisition_mode: typeof CROSS_SEARCH_ACQUISITION_MODE;
  hasImage: boolean;
  hasVideo: boolean;
  searchQueryId?: string;
};

export type CrossSearchFetchState = {
  lastAttemptAt: string | null;
  lastSuccessfulFetchAt: string | null;
  queryCount: number;
  scheduledQueryCount?: number;
  apiPostCount: number;
  acceptedPostCount: number;
  storedPostCount: number;
  unregisteredAccountPostCount: number;
  accessDeniedCount?: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "NOT_RUN";
};

export function createEmptyCrossSearchFetchState(): CrossSearchFetchState {
  return {
    lastAttemptAt: null,
    lastSuccessfulFetchAt: null,
    queryCount: 0,
    apiPostCount: 0,
    acceptedPostCount: 0,
    storedPostCount: 0,
    unregisteredAccountPostCount: 0,
    status: "NOT_RUN",
  };
}
