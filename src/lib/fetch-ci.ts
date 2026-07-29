import type { FetchRunResult } from "@/lib/fetch-runner";

export const FETCH_DATA_FILES = [
  "data/posts.json",
  "data/fetch-state.json",
  "data/source-runtime.json",
  "data/api-usage.json",
] as const;

export function isXApiPaymentRequired(result: FetchRunResult): boolean {
  if (result.status !== "FAILED" || result.sourceSummaries.length === 0) {
    return false;
  }
  return result.sourceSummaries.every(
    (summary) =>
      summary.status === "FAILED" &&
      summary.errorCode === "ACCESS_DENIED" &&
      summary.httpStatus === 402
  );
}
