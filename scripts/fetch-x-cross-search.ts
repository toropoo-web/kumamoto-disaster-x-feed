import { loadProjectEnv } from "../src/lib/load-env";
import {
  printCrossSearchSummary,
  runCrossSearchFetch,
} from "../src/lib/cross-search-runner";
import {
  isXApiFetchEnabled,
  writeXApiFetchDisabledStepSummary,
} from "../src/lib/x-api-fetch-enabled";

loadProjectEnv();

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const runAllQueries =
    process.argv.includes("--all-queries") ||
    process.env.GITHUB_EVENT_NAME === "workflow_dispatch";

  if (!isXApiFetchEnabled()) {
    writeXApiFetchDisabledStepSummary("cross-search");
    console.log("FETCH_STATUS=SKIPPED");
    console.log("X_API_FETCH_DISABLED=true");
    console.log("DATA_MODIFIED=false");
    console.log("COMMIT_SKIPPED=true");
    process.exit(0);
  }

  const result = await runCrossSearchFetch({ dryRun, runAllQueries });

  if (!result.tokenConfigured) {
    console.log("X_CROSS_SEARCH_FETCH_NOT_CONFIGURED");
    process.exit(0);
  }

  if (dryRun) {
    printCrossSearchSummary(result);
    console.log(`STATUS: ${result.status}`);
    process.exit(0);
  }

  if (result.status === "FAILED") {
    const hasStoredPosts = (result.fetchState.storedPostCount || 0) > 0;
    if (hasStoredPosts) {
      console.error(
        "Cross-search fetch degraded: all scheduled queries failed; keeping existing stored posts."
      );
      printCrossSearchSummary(result);
      process.exit(0);
    }
    console.error("Cross-search fetch failed for all queries.");
    process.exit(1);
  }

  printCrossSearchSummary(result);
  console.log(
    `Cross-search fetch complete: ${result.fetchState.acceptedPostCount} accepted, ${result.fetchState.storedPostCount} stored (${result.status})`
  );
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});

