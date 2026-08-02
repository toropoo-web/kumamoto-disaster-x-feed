import { loadProjectEnv } from "../src/lib/load-env";
import { isXApiPaymentRequired } from "../src/lib/fetch-ci";
import {
  printFetchSummary,
  writeFetchStepSummary,
} from "../src/lib/fetch-monitoring";
import { runFetch, printDryRunSummary } from "../src/lib/fetch-runner";

loadProjectEnv();

function shouldFailWorkflow(
  result: Awaited<ReturnType<typeof runFetch>>
): boolean {
  if (result.status === "FAILED") return true;
  if (
    result.status === "SUCCESS" &&
    result.totals.apiPostCount === 0 &&
    result.totals.accepted === 0 &&
    result.fetchState.storedPostCount > 0 &&
    result.sourceSummaries.length > 0 &&
    result.sourceSummaries.every((summary) => summary.status === "FAILED")
  ) {
    return true;
  }
  return false;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const result = await runFetch({ dryRun });

  if (!result.tokenConfigured) {
    console.log("X_API_FETCH_NOT_CONFIGURED");
    process.exit(0);
  }

  if (dryRun) {
    printDryRunSummary(result.sourceSummaries, result.totals);
    console.log(`STATUS: ${result.status}`);
    process.exit(0);
  }

  const dataModified =
    result.status !== "FAILED" &&
    (result.totals.accepted > 0 ||
      result.fetchState.lastAttemptAt !== null);

  printFetchSummary({
    fetchState: result.fetchState,
    summaries: result.sourceSummaries,
    dataModified: result.status !== "FAILED",
  });
  writeFetchStepSummary({
    fetchState: result.fetchState,
    summaries: result.sourceSummaries,
    dataModified: result.status !== "FAILED",
  });

  if (shouldFailWorkflow(result)) {
    if (isXApiPaymentRequired(result)) {
      console.log("FETCH_STATUS=X_API_PAYMENT_REQUIRED");
    } else {
      console.log(`FETCH_STATUS=${result.status}`);
    }
    console.log("DATA_MODIFIED=false");
    console.log("COMMIT_SKIPPED=true");
    console.error("Fetch aborted: all sources failed or persistence failed.");
    process.exit(1);
  }

  const accepted = result.totals.accepted;
  const total = result.mergedPosts?.length ?? 0;
  console.log(`FETCH_STATUS=${result.status}`);
  console.log("DATA_MODIFIED=true");
  console.log(
    `Fetch complete: ${accepted} accepted, ${total} total (${result.status})`
  );

  if (result.status === "PARTIAL") {
    console.log("FETCH_PARTIAL_SUCCESS=true");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
