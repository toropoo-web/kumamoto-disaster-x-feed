import fs from "node:fs";
import path from "node:path";
import {
  buildCrossSearchQueries,
  CROSS_SEARCH_MUNICIPALITIES,
  DISASTER_QUERY_TERMS,
  LEGACY_DISASTER_QUERY_TERMS,
} from "@/lib/cross-search-queries";
import { detectCrossSearchRegions, evaluateCrossSearchPost } from "@/lib/cross-search-filters";
import type { CrossSearchPost } from "@/types/cross-search-post";

export const REQUIRED_FETCH_KEYWORDS = DISASTER_QUERY_TERMS;

function matchAny(text: string, terms: readonly string[]): boolean {
  return terms.some(function (term) {
    return text.includes(term);
  });
}

function scopedMatch(text: string, disasterTerms: readonly string[]): boolean {
  return (
    detectCrossSearchRegions(text).length > 0 && matchAny(text, disasterTerms)
  );
}

export type QueryOptimizationComparison = {
  generatedAt: string;
  before: {
    disasterTerms: readonly string[];
    fetchProxyCount: number;
    adoptedProxyCount: number;
    adoptionRate: number;
  };
  after: {
    disasterTerms: readonly string[];
    queries: Array<{ id: string; query: string; length: number }>;
    fetchProxyCount: number;
    adoptedProxyCount: number;
    adoptionRate: number;
  };
  reduction: {
    fetchCountDelta: number;
    fetchReductionRate: number;
    adoptedCountDelta: number;
    adoptedReductionRate: number;
    apiTokenReductionRate: number;
  };
  keywordCoverage: Array<{
    keyword: string;
    inQuery: boolean;
    corpusMatchCount: number;
    sampleFound: boolean;
  }>;
};

export function analyzeQueryOptimization(posts: CrossSearchPost[]): QueryOptimizationComparison {
  const beforeFetch = posts.filter(function (post) {
    const text = post.content || post.summary || "";
    return scopedMatch(text, LEGACY_DISASTER_QUERY_TERMS);
  });
  const afterFetch = posts.filter(function (post) {
    const text = post.content || post.summary || "";
    return scopedMatch(text, DISASTER_QUERY_TERMS);
  });

  const beforeAdopted = beforeFetch.filter(function (post) {
    return evaluateCrossSearchPost({
      text: post.content || post.summary || "",
      postedAt: post.postedAt,
      accountHandle: post.accountHandle,
    }).pass;
  }).length;

  const afterAdopted = afterFetch.filter(function (post) {
    return evaluateCrossSearchPost({
      text: post.content || post.summary || "",
      postedAt: post.postedAt,
      accountHandle: post.accountHandle,
    }).pass;
  }).length;

  const queries = buildCrossSearchQueries();
  const queryBlob = queries.map(function (query) {
    return query.query;
  }).join(" ");

  const keywordCoverage = REQUIRED_FETCH_KEYWORDS.map(function (keyword) {
    const corpusMatchCount = posts.filter(function (post) {
      const text = post.content || post.summary || "";
      return scopedMatch(text, [keyword]);
    }).length;
    return {
      keyword,
      inQuery: queryBlob.includes(`"${keyword}"`) || queryBlob.includes(keyword),
      corpusMatchCount,
      sampleFound: corpusMatchCount > 0,
    };
  });

  const fetchReductionRate =
    beforeFetch.length > 0
      ? 1 - afterFetch.length / beforeFetch.length
      : 0;
  const adoptedReductionRate =
    beforeAdopted > 0 ? 1 - afterAdopted / beforeAdopted : 0;

  return {
    generatedAt: new Date().toISOString(),
    before: {
      disasterTerms: LEGACY_DISASTER_QUERY_TERMS,
      fetchProxyCount: beforeFetch.length,
      adoptedProxyCount: beforeAdopted,
      adoptionRate:
        beforeFetch.length > 0 ? beforeAdopted / beforeFetch.length : 0,
    },
    after: {
      disasterTerms: DISASTER_QUERY_TERMS,
      queries: queries.map(function (query) {
        return {
          id: query.id,
          query: query.query,
          length: query.query.length,
        };
      }),
      fetchProxyCount: afterFetch.length,
      adoptedProxyCount: afterAdopted,
      adoptionRate:
        afterFetch.length > 0 ? afterAdopted / afterFetch.length : 0,
    },
    reduction: {
      fetchCountDelta: beforeFetch.length - afterFetch.length,
      fetchReductionRate,
      adoptedCountDelta: beforeAdopted - afterAdopted,
      adoptedReductionRate,
      apiTokenReductionRate: fetchReductionRate,
    },
    keywordCoverage,
  };
}

export function formatQueryOptimizationMarkdown(
  report: QueryOptimizationComparison
): string {
  const lines: string[] = [];
  lines.push("# X Cross Search Query Optimization — PHASE_RESULT");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## 変更クエリ");
  lines.push("");
  report.after.queries.forEach(function (query) {
    lines.push(`- **${query.id}** (${query.length} chars): \`${query.query}\``);
  });
  lines.push("");
  lines.push("## 取得件数比較（コーパス代理）");
  lines.push("");
  lines.push("| 区分 | 取得代理 | 採用代理 | 採用率 |");
  lines.push("| --- | ---: | ---: | ---: |");
  lines.push(
    `| 変更前 | ${report.before.fetchProxyCount} | ${report.before.adoptedProxyCount} | ${(report.before.adoptionRate * 100).toFixed(1)}% |`
  );
  lines.push(
    `| 変更後 | ${report.after.fetchProxyCount} | ${report.after.adoptedProxyCount} | ${(report.after.adoptionRate * 100).toFixed(1)}% |`
  );
  lines.push("");
  lines.push("## API消費削減率");
  lines.push("");
  lines.push(
    `- 取得件数削減率: **${(report.reduction.fetchReductionRate * 100).toFixed(1)}%** (${report.reduction.fetchCountDelta}件)`
  );
  lines.push(
    `- 採用件数削減率: **${(report.reduction.adoptedReductionRate * 100).toFixed(1)}%** (${report.reduction.adoptedCountDelta}件)`
  );
  lines.push(
    `- API Token削減率（取得代理）: **${(report.reduction.apiTokenReductionRate * 100).toFixed(1)}%**`
  );
  lines.push("");
  lines.push("## 検索確認（必須キーワード）");
  lines.push("");
  lines.push("| キーワード | クエリ含有 | コーパス適合 |");
  lines.push("| --- | --- | ---: |");
  report.keywordCoverage.forEach(function (row) {
    lines.push(
      `| ${row.keyword} | ${row.inQuery ? "OK" : "NG"} | ${row.corpusMatchCount} |`
    );
  });
  lines.push("");
  lines.push(`## 自治体数: ${CROSS_SEARCH_MUNICIPALITIES.length}`);
  lines.push("");
  return lines.join("\n");
}

export function writeQueryOptimizationArtifacts(
  posts: CrossSearchPost[],
  rootDir: string
): QueryOptimizationComparison {
  const report = analyzeQueryOptimization(posts);
  const jsonPath = path.join(
    rootDir,
    "docs",
    "X_CROSS_SEARCH_QUERY_OPTIMIZATION_REPORT.json"
  );
  const mdPath = path.join(
    rootDir,
    "docs",
    "X_CROSS_SEARCH_QUERY_OPTIMIZATION_PHASE_RESULT.md"
  );
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    mdPath,
    `${formatQueryOptimizationMarkdown(report)}\n`,
    "utf8"
  );
  return report;
}
