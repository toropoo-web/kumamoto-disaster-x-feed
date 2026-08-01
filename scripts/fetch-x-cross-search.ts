import { loadProjectEnv } from "../src/lib/load-env";
import {
  printCrossSearchSummary,
  runCrossSearchFetch,
} from "../src/lib/cross-search-runner";

loadProjectEnv();

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const result = await runCrossSearchFetch({ dryRun });

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
