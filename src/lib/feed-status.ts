import fs from "fs";
import path from "path";
import type { FetchState } from "@/types/post";
import type { PostProcessingBreakdown } from "@/types/post-processing";
import { readJsonFile, writeJsonAtomically } from "@/lib/json-io";

export type FeedStatusValue = "SUCCESS" | "ERROR";

export type FeedStatus = {
  last_success_at: string;
  last_fetch_count: string;
  last_commit: string;
  status: FeedStatusValue;
};

const FEED_STATUS_FILE = () => path.join(process.cwd(), "data", "feed-status.json");

export function createEmptyFeedStatus(): FeedStatus {
  return {
    last_success_at: "",
    last_fetch_count: "",
    last_commit: "",
    status: "ERROR",
  };
}

export function readFeedStatus(): FeedStatus {
  return readJsonFile<FeedStatus>(FEED_STATUS_FILE(), createEmptyFeedStatus());
}

export function writeFeedStatus(status: FeedStatus): void {
  writeJsonAtomically(FEED_STATUS_FILE(), status);
}

export function buildSuccessFeedStatus(options: {
  now: string;
  acceptedCount: number;
  previous?: FeedStatus;
  lastCommit?: string;
}): FeedStatus {
  const previous = options.previous ?? createEmptyFeedStatus();
  return {
    last_success_at: options.now,
    last_fetch_count: String(options.acceptedCount),
    last_commit: options.lastCommit ?? previous.last_commit,
    status: "SUCCESS",
  };
}

export function buildErrorFeedStatus(options: {
  previous?: FeedStatus;
  lastFetchCount?: string;
}): FeedStatus {
  const previous = options.previous ?? readFeedStatus();
  return {
    last_success_at: previous.last_success_at,
    last_fetch_count: options.lastFetchCount ?? previous.last_fetch_count,
    last_commit: previous.last_commit,
    status: "ERROR",
  };
}

export function stampFeedStatusCommit(commitSha: string): FeedStatus {
  const current = readFeedStatus();
  const next: FeedStatus = {
    ...current,
    last_commit: commitSha,
  };
  writeFeedStatus(next);
  return next;
}

export function feedStatusFromFetchResult(options: {
  persisted: boolean;
  fetchState: FetchState;
  totals: PostProcessingBreakdown;
  now: string;
}): FeedStatus {
  const previous = readFeedStatus();

  if (!options.persisted || options.fetchState.status === "FAILED") {
    return buildErrorFeedStatus({
      previous,
      lastFetchCount: String(options.totals.accepted),
    });
  }

  return buildSuccessFeedStatus({
    now: options.fetchState.lastSuccessfulFetchAt ?? options.now,
    acceptedCount: options.totals.accepted,
    previous,
  });
}

export function assertFeedStatusShape(status: FeedStatus): void {
  if (typeof status.last_success_at !== "string") {
    throw new Error("feed-status.last_success_at must be a string");
  }
  if (typeof status.last_fetch_count !== "string") {
    throw new Error("feed-status.last_fetch_count must be a string");
  }
  if (typeof status.last_commit !== "string") {
    throw new Error("feed-status.last_commit must be a string");
  }
  if (status.status !== "SUCCESS" && status.status !== "ERROR") {
    throw new Error("feed-status.status must be SUCCESS or ERROR");
  }
}

export function getFeedStatusFilePath(): string {
  return FEED_STATUS_FILE();
}
