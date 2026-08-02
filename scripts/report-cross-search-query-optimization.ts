import fs from "node:fs";
import path from "node:path";
import { writeQueryOptimizationArtifacts } from "../src/lib/cross-search-query-optimization";
import type { CrossSearchPost } from "../src/types/cross-search-post";

const ROOT = path.resolve(import.meta.dirname, "..");
const POSTS_FILE = path.join(ROOT, "data", "posts-cross-search.json");

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function main(): void {
  const posts = readJson<CrossSearchPost[]>(POSTS_FILE, []);
  const report = writeQueryOptimizationArtifacts(posts, ROOT);
  console.log(
    JSON.stringify(
      {
        phase: "X_CROSS_SEARCH_QUERY_OPTIMIZATION",
        beforeFetch: report.before.fetchProxyCount,
        afterFetch: report.after.fetchProxyCount,
        beforeAdopted: report.before.adoptedProxyCount,
        afterAdopted: report.after.adoptedProxyCount,
        apiTokenReductionRate: report.reduction.apiTokenReductionRate,
        keywordCoveragePass: report.keywordCoverage.every(function (row) {
          return row.inQuery;
        }),
      },
      null,
      2
    )
  );
}

main();
