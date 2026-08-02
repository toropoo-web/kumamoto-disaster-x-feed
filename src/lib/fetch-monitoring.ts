import fs from "fs";
import type { FetchState } from "@/types/post";
import type { SourceFetchSummary } from "@/lib/fetch-runner";

export type FetchFailureReason =
  | "X_API_PAYMENT_REQUIRED"
  | "AUTHENTICATION_ERROR"
  | "RATE_LIMITED"
  | "INVALID_RESPONSE"
  | "ALL_SOURCES_FAILED"
  | "PERSISTENCE_FAILED"
  | "PARTIAL_SOURCE_FAILURE"
  | null;

export function listSuccessfulSourceIds(
  summaries: SourceFetchSummary[]
): string[] {
  return summaries
    .filter((summary) => summary.status !== "FAILED")
    .map((summary) => summary.sourceId);
}

export function listFailedSourceIds(summaries: SourceFetchSummary[]): string[] {
  return summaries
    .filter((summary) => summary.status === "FAILED")
    .map((summary) => summary.sourceId);
}

export function resolveLastHttpStatus(
  summaries: SourceFetchSummary[]
): number | null {
  const failed = summaries.find(
    (summary) => summary.status === "FAILED" && summary.httpStatus !== undefined
  );
  return failed?.httpStatus ?? null;
}

export function resolveFailureReason(
  summaries: SourceFetchSummary[],
  status: FetchState["status"]
): FetchFailureReason {
  if (status === "SUCCESS" || status === "NOT_RUN") return null;

  const failed = summaries.filter((summary) => summary.status === "FAILED");
  if (failed.length === 0) return null;

  const codes = new Set(
    failed.map((summary) => summary.errorCode).filter(Boolean) as string[]
  );
  const statuses = new Set(
    failed
      .map((summary) => summary.httpStatus)
      .filter((value): value is number => value !== undefined)
  );

  if (
    failed.length === summaries.length &&
    codes.size === 1 &&
    codes.has("ACCESS_DENIED") &&
    statuses.size === 1 &&
    statuses.has(402)
  ) {
    return "X_API_PAYMENT_REQUIRED";
  }

  if (failed.length === summaries.length && codes.size === 1) {
    if (codes.has("AUTHENTICATION_ERROR")) return "AUTHENTICATION_ERROR";
    if (codes.has("RATE_LIMITED")) return "RATE_LIMITED";
    if (codes.has("INVALID_RESPONSE")) return "INVALID_RESPONSE";
  }

  if (status === "PARTIAL") return "PARTIAL_SOURCE_FAILURE";
  if (failed.length === summaries.length) return "ALL_SOURCES_FAILED";
  return "PARTIAL_SOURCE_FAILURE";
}

export function nextConsecutiveFailures(
  previous: number | undefined,
  status: FetchState["status"]
): number {
  if (status === "SUCCESS" || status === "PARTIAL") return 0;
  return (previous ?? 0) + 1;
}

export function buildMonitoringFields(params: {
  summaries: SourceFetchSummary[];
  status: FetchState["status"];
  previousState: FetchState;
}): Pick<
  FetchState,
  | "lastHttpStatus"
  | "consecutiveFailures"
  | "successfulSources"
  | "failedSources"
  | "failureReason"
> {
  return {
    lastHttpStatus: resolveLastHttpStatus(params.summaries),
    consecutiveFailures: nextConsecutiveFailures(
      params.previousState.consecutiveFailures,
      params.status
    ),
    successfulSources: listSuccessfulSourceIds(params.summaries),
    failedSources: listFailedSourceIds(params.summaries),
    failureReason: resolveFailureReason(params.summaries, params.status),
  };
}

export function formatFetchSummaryLines(params: {
  fetchState: FetchState;
  summaries: SourceFetchSummary[];
  dataModified: boolean;
}): string[] {
  const { fetchState, summaries, dataModified } = params;
  return [
    `FETCH_SUMMARY_STATUS=${fetchState.status}`,
    `FETCH_SUMMARY_HTTP_STATUS=${fetchState.lastHttpStatus ?? "none"}`,
    `FETCH_SUMMARY_SUCCESS_SOURCES=${fetchState.successfulSourceCount}`,
    `FETCH_SUMMARY_FAILED_SOURCES=${fetchState.failedSourceCount}`,
    `FETCH_SUMMARY_FETCHED_COUNT=${fetchState.fetchedPostCount}`,
    `FETCH_SUMMARY_STORED_COUNT=${fetchState.storedPostCount}`,
    `FETCH_SUMMARY_ACCEPTED_COUNT=${fetchState.acceptedPostCount}`,
    `FETCH_SUMMARY_LAST_SUCCESS_AT=${fetchState.lastSuccessfulFetchAt ?? "none"}`,
    `FETCH_SUMMARY_LAST_ATTEMPT_AT=${fetchState.lastAttemptAt ?? "none"}`,
    `FETCH_SUMMARY_FAILURE_REASON=${fetchState.failureReason ?? "none"}`,
    `FETCH_SUMMARY_CONSECUTIVE_FAILURES=${fetchState.consecutiveFailures ?? 0}`,
    `FETCH_SUMMARY_DATA_MODIFIED=${dataModified ? "true" : "false"}`,
    `FETCH_SUMMARY_SOURCE_COUNT=${summaries.length}`,
  ];
}

export function buildFetchStepSummaryMarkdown(params: {
  fetchState: FetchState;
  summaries: SourceFetchSummary[];
  dataModified: boolean;
}): string {
  const { fetchState, summaries, dataModified } = params;
  const failedDetails = summaries
    .filter((summary) => summary.status === "FAILED")
    .map((summary) => {
      const parts = [
        summary.sourceId,
        summary.errorCode ?? "UNKNOWN",
        summary.httpStatus !== undefined ? `HTTP ${summary.httpStatus}` : "HTTP ?",
        summary.failureStage ?? "unknown_stage",
      ];
      if (summary.apiErrorTitle) parts.push(summary.apiErrorTitle);
      return `- ${parts.join(" | ")}`;
    });

  const lines = [
    "## X Fetch Run Summary",
    "",
    "| Field | Value |",
    "|---|---|",
    `| Status | ${fetchState.status} |`,
    `| HTTP status | ${fetchState.lastHttpStatus ?? "n/a"} |`,
    `| Successful sources | ${fetchState.successfulSourceCount} |`,
    `| Failed sources | ${fetchState.failedSourceCount} |`,
    `| Fetched count | ${fetchState.fetchedPostCount} |`,
    `| Accepted count | ${fetchState.acceptedPostCount} |`,
    `| Stored count | ${fetchState.storedPostCount} |`,
    `| Last success at | ${fetchState.lastSuccessfulFetchAt ?? "n/a"} |`,
    `| Last attempt at | ${fetchState.lastAttemptAt ?? "n/a"} |`,
    `| Failure reason | ${fetchState.failureReason ?? "none"} |`,
    `| Consecutive failures | ${fetchState.consecutiveFailures ?? 0} |`,
    `| Data modified | ${dataModified ? "yes" : "no"} |`,
  ];

  if (failedDetails.length > 0) {
    lines.push("", "### Failed sources", "", ...failedDetails);
  }

  return `${lines.join("\n")}\n`;
}

export function writeFetchStepSummary(params: {
  fetchState: FetchState;
  summaries: SourceFetchSummary[];
  dataModified: boolean;
}): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  fs.appendFileSync(
    summaryPath,
    buildFetchStepSummaryMarkdown(params),
    "utf8"
  );
}

export function printFetchSummary(params: {
  fetchState: FetchState;
  summaries: SourceFetchSummary[];
  dataModified: boolean;
}): void {
  for (const line of formatFetchSummaryLines(params)) {
    console.log(line);
  }
}
