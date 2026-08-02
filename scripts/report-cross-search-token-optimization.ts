import fs from "node:fs";
import path from "node:path";
import {
  analyzeCrossSearchTokenOptimization,
  formatCrossSearchTokenOptimizationMarkdown,
} from "../src/lib/cross-search-token-optimization";
import type { CrossSearchFetchState, CrossSearchPost } from "../src/types/cross-search-post";

const ROOT = path.resolve(import.meta.dirname, "..");
const POSTS_FILE = path.join(ROOT, "data", "posts-cross-search.json");
const STATE_FILE = path.join(ROOT, "data", "cross-search-fetch-state.json");
const REPORT_JSON = path.join(
  ROOT,
  "docs",
  "X_CROSS_SEARCH_TOKEN_OPTIMIZATION_REPORT.json"
);
const REPORT_MD = path.join(
  ROOT,
  "docs",
  "X_CROSS_SEARCH_TOKEN_OPTIMIZATION_PHASE_RESULT.md"
);

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function main(): void {
  const posts = readJson<CrossSearchPost[]>(POSTS_FILE, []);
  const fetchState = readJson<CrossSearchFetchState | null>(STATE_FILE, null);
  const report = analyzeCrossSearchTokenOptimization({ posts, fetchState });
  const markdown = formatCrossSearchTokenOptimizationMarkdown(report);

  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(REPORT_MD, `${markdown}\n`, "utf8");

  console.log(`WROTE ${path.relative(ROOT, REPORT_JSON)}`);
  console.log(`WROTE ${path.relative(ROOT, REPORT_MD)}`);
  console.log(
    JSON.stringify(
      {
        phase: "X_CROSS_SEARCH_TOKEN_OPTIMIZATION",
        storedPosts: posts.length,
        recommendation: report.recommendation.queryStrategy,
        predictedApiReductionRate: report.recommendation.predictedApiReductionRate,
      },
      null,
      2
    )
  );
}

main();
