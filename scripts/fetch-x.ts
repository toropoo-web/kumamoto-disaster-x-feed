import { loadProjectEnv } from "../src/lib/load-env";
import { isXApiPaymentRequired } from "../src/lib/fetch-ci";
import { runFetch, printDryRunSummary } from "../src/lib/fetch-runner";

loadProjectEnv();

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

  if (result.status === "FAILED") {
    if (isXApiPaymentRequired(result)) {
      console.log("FETCH_STATUS=X_API_PAYMENT_REQUIRED");
      console.log("DATA_MODIFIED=false");
      console.log("COMMIT_SKIPPED=true");
      process.exit(2);
    }
    console.error("Fetch aborted: all sources failed or persistence failed.");
    process.exit(1);
  }

  const accepted = result.totals.accepted;
  const total = result.mergedPosts?.length ?? 0;
  console.log(
    `Fetch complete: ${accepted} accepted, ${total} total (${result.status})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
