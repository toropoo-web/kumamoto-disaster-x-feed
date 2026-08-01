import { loadProjectEnv } from "../src/lib/load-env";
import {
  printCrossSearchSummary,
  runCrossSearchFetch,
} from "../src/lib/cross-search-runner";

loadProjectEnv();

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const runAllQueries =
    process.argv.includes("--all-queries") ||
    process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
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
