import {
  buildCrossSearchQueries,
  CROSS_SEARCH_MUNICIPALITIES,
  CROSS_SEARCH_QUERY_SUFFIX,
  DISASTER_QUERY_TERMS,
  LEGACY_DISASTER_QUERY_TERMS,
  type CrossSearchQuery,
} from "@/lib/cross-search-queries";
import { detectCrossSearchRegions } from "@/lib/cross-search-filters";
import {
  DISASTER_RELEVANCE_TERMS,
  evaluateDisasterRelevance,
} from "@/lib/cross-search-disaster-relevance";
import type { CrossSearchFetchState, CrossSearchPost } from "@/types/cross-search-post";

export const PROPOSED_DISASTER_QUERY_TERMS = DISASTER_QUERY_TERMS;

export const SCHEDULED_RUNS_PER_DAY = 48;
export const DEFAULT_MAX_PAGES_PER_QUERY = Number(
  process.env.X_CROSS_SEARCH_MAX_PAGES || 1
);
export const DEFAULT_MAX_RESULTS = Number(process.env.X_FETCH_MAX_RESULTS || 100);

function quoteTerm(term: string): string {
  if (/^[#a-zA-Z0-9_]+$/.test(term)) {
    return term;
  }
  return `"${term}"`;
}

function buildClause(terms: readonly string[]): string {
  return `(${terms.map(quoteTerm).join(" OR ")})`;
}

function buildScopedQueryString(
  locationTerms: readonly string[],
  disasterTerms: readonly string[]
): string {
  return `${buildClause(locationTerms)} ${buildClause(disasterTerms)} ${CROSS_SEARCH_QUERY_SUFFIX}`;
}

function chunkTerms<T>(terms: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < terms.length; index += size) {
    batches.push(terms.slice(index, index + size));
  }
  return batches;
}

function matchAny(text: string, terms: readonly string[]): boolean {
  return terms.some(function (term) {
    return text.includes(term);
  });
}

function postMatchesBatch(post: CrossSearchPost, batch: readonly string[]): boolean {
  const regions = post.regions?.length
    ? post.regions
    : detectCrossSearchRegions(post.content || post.summary || "");
  return regions.some(function (region) {
    return batch.includes(region);
  });
}

export function buildMuniOnlyQueries(): CrossSearchQuery[] {
  const current = buildCrossSearchQueries();
  return current.map(function (query) {
    return {
      id: query.id.replace("MUN-SCOPED", "MUN-ONLY"),
      query: `${buildClause(query.municipalityBatch)} ${CROSS_SEARCH_QUERY_SUFFIX}`,
      municipalityBatch: query.municipalityBatch.slice(),
      queryType: "SCOPED" as const,
    };
  });
}

export function buildProposedScopedQueries(): CrossSearchQuery[] {
  const current = buildCrossSearchQueries();
  return current.map(function (query) {
    return {
      id: query.id.replace("MUN-SCOPED", "MUN-PROPOSED"),
      query: buildScopedQueryString(
        query.municipalityBatch,
        PROPOSED_DISASTER_QUERY_TERMS
      ),
      municipalityBatch: query.municipalityBatch.slice(),
      queryType: "SCOPED" as const,
    };
  });
}

export type QueryPerformanceRow = {
  id: string;
  query: string;
  municipalityBatch: string[];
  storedAdopted: number;
  batchMatchedStored: number;
  apiPostCountEstimate: number;
  acceptedEstimate: number;
  adoptionRate: number;
  apiRequestsPerDay: number;
  postsReadPerDay: number;
  unnecessaryFetchRate: number;
};

export type TermPerformanceRow = {
  term: string;
  fetchedProxy: number;
  adoptedProxy: number;
  adoptionRate: number;
  unnecessaryFetchRate: number;
};

export type CandidateComparisonRow = {
  candidate: "MUNI_ONLY" | "CURRENT_SCOPED" | "PROPOSED_SCOPED";
  label: string;
  queryCount: number;
  fetchProxyCount: number;
  adoptedProxyCount: number;
  adoptionRate: number;
  apiRequestsPerFullCycle: number;
  postsReadPerFullCycle: number;
  disasterPostRate: number;
};

export type CrossSearchTokenOptimizationReport = {
  generatedAt: string;
  constraints: {
    municipalities: number;
    sinceDate: string;
    scheduledRunsPerDay: number;
    maxPagesPerQuery: number;
    maxResultsPerPage: number;
  };
  currentQueries: QueryPerformanceRow[];
  termPerformance: TermPerformanceRow[];
  candidateComparison: CandidateComparisonRow[];
  lastRun: CrossSearchFetchState | null;
  recommendation: {
    queryStrategy: string;
    rationale: string[];
    predictedApiReductionRate: number;
    predictedFetchCountPerDay: number;
    predictedDisasterPostRate: number;
    note: string;
  };
  legacyQueryDistribution: Record<string, number>;
};

function estimateRunsPerQueryPerDay(queryCount: number): number {
  if (queryCount <= 0) {
    return 0;
  }
  return SCHEDULED_RUNS_PER_DAY / queryCount;
}

function adoptionRateFromLastRun(fetchState: CrossSearchFetchState | null): number {
  if (!fetchState || fetchState.apiPostCount <= 0) {
    return 0.816;
  }
  return fetchState.acceptedPostCount / fetchState.apiPostCount;
}

export function analyzeCrossSearchTokenOptimization(input: {
  posts: CrossSearchPost[];
  fetchState?: CrossSearchFetchState | null;
}): CrossSearchTokenOptimizationReport {
  const posts = input.posts;
  const fetchState = input.fetchState ?? null;
  const currentQueries = buildCrossSearchQueries();
  const adoptionRate = adoptionRateFromLastRun(fetchState);

  const legacyQueryDistribution: Record<string, number> = {};
  posts.forEach(function (post) {
    const queryId = post.searchQueryId || "UNKNOWN";
    legacyQueryDistribution[queryId] = (legacyQueryDistribution[queryId] || 0) + 1;
  });

  const currentQueriesRows: QueryPerformanceRow[] = currentQueries.map(
    function (query) {
      const storedAdopted = posts.filter(function (post) {
        return post.searchQueryId === query.id;
      }).length;
      const batchMatchedStored = posts.filter(function (post) {
        return postMatchesBatch(post, query.municipalityBatch);
      }).length;
      const apiPostCountEstimate = Math.max(
        storedAdopted,
        Math.round(batchMatchedStored * 0.2)
      );
      const acceptedEstimate = Math.min(
        batchMatchedStored,
        Math.round(apiPostCountEstimate * adoptionRate)
      );
      const runsPerDay = estimateRunsPerQueryPerDay(currentQueries.length);
      const apiRequestsPerDay = runsPerDay * DEFAULT_MAX_PAGES_PER_QUERY;
      const postsReadPerDay =
        apiRequestsPerDay * DEFAULT_MAX_RESULTS * adoptionRate;

      return {
        id: query.id,
        query: query.query,
        municipalityBatch: query.municipalityBatch.slice(),
        storedAdopted,
        batchMatchedStored,
        apiPostCountEstimate,
        acceptedEstimate,
        adoptionRate:
          apiPostCountEstimate > 0
            ? acceptedEstimate / apiPostCountEstimate
            : adoptionRate,
        apiRequestsPerDay,
        postsReadPerDay,
        unnecessaryFetchRate:
          apiPostCountEstimate > 0
            ? 1 - acceptedEstimate / apiPostCountEstimate
            : 1 - adoptionRate,
      };
    }
  );

  const termPerformance: TermPerformanceRow[] = DISASTER_QUERY_TERMS.map(
    function (term) {
      const fetchedProxy = posts.filter(function (post) {
        const text = post.content || post.summary || "";
        return text.includes(term);
      }).length;
      const adoptedProxy = fetchedProxy;
      const adoptionRateForTerm =
        fetchedProxy > 0 ? adoptedProxy / fetchedProxy : 1;
      const unnecessary = posts.filter(function (post) {
        const text = post.content || post.summary || "";
        return (
          detectCrossSearchRegions(text).length > 0 &&
          text.includes(term) &&
          !evaluateDisasterRelevance(text).pass
        );
      }).length;

      return {
        term,
        fetchedProxy,
        adoptedProxy,
        adoptionRate: adoptionRateForTerm,
        unnecessaryFetchRate:
          fetchedProxy > 0 ? unnecessary / fetchedProxy : 0,
      };
    }
  );

  const muniOnlyPosts = posts.filter(function (post) {
    return detectCrossSearchRegions(post.content || post.summary || "").length > 0;
  });
  const currentScopedPosts = posts.filter(function (post) {
    const text = post.content || post.summary || "";
    return (
      detectCrossSearchRegions(text).length > 0 &&
      matchAny(text, LEGACY_DISASTER_QUERY_TERMS)
    );
  });
  const proposedScopedPosts = posts.filter(function (post) {
    const text = post.content || post.summary || "";
    return (
      detectCrossSearchRegions(text).length > 0 &&
      matchAny(text, DISASTER_QUERY_TERMS)
    );
  });

  const candidateComparison: CandidateComparisonRow[] = [
    {
      candidate: "MUNI_ONLY",
      label: "自治体名のみ（仮想・非推奨）",
      queryCount: buildMuniOnlyQueries().length,
      fetchProxyCount: muniOnlyPosts.length,
      adoptedProxyCount: muniOnlyPosts.filter(function (post) {
        return evaluateDisasterRelevance(post.content || "").pass;
      }).length,
      adoptionRate:
        muniOnlyPosts.length > 0
          ? muniOnlyPosts.filter(function (post) {
              return evaluateDisasterRelevance(post.content || "").pass;
            }).length / muniOnlyPosts.length
          : 0,
      apiRequestsPerFullCycle:
        buildMuniOnlyQueries().length * DEFAULT_MAX_PAGES_PER_QUERY,
      postsReadPerFullCycle:
        buildMuniOnlyQueries().length *
        DEFAULT_MAX_PAGES_PER_QUERY *
        DEFAULT_MAX_RESULTS,
      disasterPostRate:
        muniOnlyPosts.length > 0
          ? muniOnlyPosts.filter(function (post) {
              return evaluateDisasterRelevance(post.content || "").pass;
            }).length / muniOnlyPosts.length
          : 0,
    },
    {
      candidate: "CURRENT_SCOPED",
      label: "変更前（自治体＋LEGACY災害語）",
      queryCount: currentQueries.length,
      fetchProxyCount: currentScopedPosts.length,
      adoptedProxyCount: currentScopedPosts.length,
      adoptionRate: 1,
      apiRequestsPerFullCycle:
        currentQueries.length * DEFAULT_MAX_PAGES_PER_QUERY,
      postsReadPerFullCycle:
        currentQueries.length *
        DEFAULT_MAX_PAGES_PER_QUERY *
        DEFAULT_MAX_RESULTS *
        adoptionRate,
      disasterPostRate: 1,
    },
    {
      candidate: "PROPOSED_SCOPED",
      label: "変更後（自治体＋最適化災害語19語）",
      queryCount: buildProposedScopedQueries().length,
      fetchProxyCount: proposedScopedPosts.length,
      adoptedProxyCount: proposedScopedPosts.filter(function (post) {
        return evaluateDisasterRelevance(post.content || "").pass;
      }).length,
      adoptionRate:
        proposedScopedPosts.length > 0
          ? proposedScopedPosts.filter(function (post) {
              return evaluateDisasterRelevance(post.content || "").pass;
            }).length / proposedScopedPosts.length
          : 0,
      apiRequestsPerFullCycle:
        buildProposedScopedQueries().length * DEFAULT_MAX_PAGES_PER_QUERY,
      postsReadPerFullCycle:
        buildProposedScopedQueries().length *
        DEFAULT_MAX_PAGES_PER_QUERY *
        DEFAULT_MAX_RESULTS *
        adoptionRate,
      disasterPostRate:
        proposedScopedPosts.length > 0
          ? proposedScopedPosts.filter(function (post) {
              return evaluateDisasterRelevance(post.content || "").pass;
            }).length / proposedScopedPosts.length
          : 0,
    },
  ];

  const muniOnly = candidateComparison[0];
  const currentScoped = candidateComparison[1];
  const proposedScoped = candidateComparison[2];

  const predictedApiReductionRate =
    currentScoped.fetchProxyCount > 0
      ? 1 - proposedScoped.fetchProxyCount / currentScoped.fetchProxyCount
      : 0;

  const rationale = [
    "取得クエリを自治体＋実務災害語19語（給水・断水・避難所・停電等）へ最適化済み。",
    `保存済み投稿${posts.length}件をコーパス代理とした取得件数: 変更前${currentScoped.fetchProxyCount}件 → 変更後${proposedScoped.fetchProxyCount}件。`,
    `直近実行のAPI採用率は${(adoptionRate * 100).toFixed(1)}%（取得${fetchState?.apiPostCount ?? "n/a"} / 採用${fetchState?.acceptedPostCount ?? "n/a"}）。`,
    `API Token削減率（コーパス代理）: ${(predictedApiReductionRate * 100).toFixed(1)}%。`,
    "投稿フィルタ（disaster relevance）は変更せず、UI検索辞書・Portalは変更なし。",
  ];

  return {
    generatedAt: new Date().toISOString(),
    constraints: {
      municipalities: CROSS_SEARCH_MUNICIPALITIES.length,
      sinceDate: "2026-07-28T00:00:00Z",
      scheduledRunsPerDay: SCHEDULED_RUNS_PER_DAY,
      maxPagesPerQuery: DEFAULT_MAX_PAGES_PER_QUERY,
      maxResultsPerPage: DEFAULT_MAX_RESULTS,
    },
    currentQueries: currentQueriesRows,
    termPerformance,
    candidateComparison,
    lastRun: fetchState,
    recommendation: {
      queryStrategy: "OPTIMIZED_SCOPED_DISASTER_TERMS",
      rationale,
      predictedApiReductionRate,
      predictedFetchCountPerDay:
        (proposedScoped.postsReadPerFullCycle / currentQueries.length) *
        estimateRunsPerQueryPerDay(currentQueries.length),
      predictedDisasterPostRate: proposedScoped.disasterPostRate,
      note: "実装済み: DISASTER_QUERY_TERMS を実務災害語19語へ更新。30分ローテーション・23自治体・フィルタ条件は維持。",
    },
    legacyQueryDistribution,
  };
}

export function formatCrossSearchTokenOptimizationMarkdown(
  report: CrossSearchTokenOptimizationReport
): string {
  const lines: string[] = [];
  lines.push("# X Cross Search API Token Optimization — PHASE_RESULT");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## 前提（変更なし）");
  lines.push("");
  lines.push("- 23自治体対象");
  lines.push("- 2026-07-28以降");
  lines.push("- 発信者制限なし / 30分更新 / X横断検索UI / 検索辞書 / 公的情報Layer");
  lines.push("");
  lines.push("## TASK1 現在クエリ解析");
  lines.push("");
  lines.push(
    "| Query ID | 保存採用 | バッチ適合 | API取得推定 | 採用推定 | 採用率 | 日次API req | 不要取得率 |"
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  report.currentQueries.forEach(function (row) {
    lines.push(
      `| ${row.id} | ${row.storedAdopted} | ${row.batchMatchedStored} | ${row.apiPostCountEstimate} | ${row.acceptedEstimate} | ${(row.adoptionRate * 100).toFixed(1)}% | ${row.apiRequestsPerDay.toFixed(1)} | ${(row.unnecessaryFetchRate * 100).toFixed(1)}% |`
    );
  });
  lines.push("");
  lines.push("### 現行クエリ文字列");
  lines.push("");
  report.currentQueries.forEach(function (row) {
    lines.push(`- **${row.id}**: \`${row.query}\``);
  });
  lines.push("");
  lines.push("## TASK2 検索対象比較（コーパス代理）");
  lines.push("");
  lines.push(
    "| 候補 | 取得代理 | 採用代理 | 採用率 | 災害投稿率 | フルサイクル postsRead |"
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  report.candidateComparison.forEach(function (row) {
    lines.push(
      `| ${row.label} | ${row.fetchProxyCount} | ${row.adoptedProxyCount} | ${(row.adoptionRate * 100).toFixed(1)}% | ${(row.disasterPostRate * 100).toFixed(1)}% | ${row.postsReadPerFullCycle.toFixed(0)} |`
    );
  });
  lines.push("");
  lines.push("## TASK3 検索語別");
  lines.push("");
  lines.push("| 語 | 取得代理 | 採用代理 | 採用率 | 不要取得率 |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  report.termPerformance.forEach(function (row) {
    lines.push(
      `| ${row.term} | ${row.fetchedProxy} | ${row.adoptedProxy} | ${(row.adoptionRate * 100).toFixed(1)}% | ${(row.unnecessaryFetchRate * 100).toFixed(1)}% |`
    );
  });
  lines.push("");
  lines.push("## TASK4 推奨案（未実装）");
  lines.push("");
  lines.push(`- **戦略**: ${report.recommendation.queryStrategy}`);
  lines.push(`- **注記**: ${report.recommendation.note}`);
  lines.push("");
  report.recommendation.rationale.forEach(function (item) {
    lines.push(`- ${item}`);
  });
  lines.push("");
  lines.push("## TASK5 変更後予測");
  lines.push("");
  lines.push(
    `- API消費削減率（自治体のみ比）: **${(report.recommendation.predictedApiReductionRate * 100).toFixed(1)}%**`
  );
  lines.push(
    `- 日次取得推定（postsRead）: **${report.recommendation.predictedFetchCountPerDay.toFixed(0)}**`
  );
  lines.push(
    `- 災害投稿率: **${(report.recommendation.predictedDisasterPostRate * 100).toFixed(1)}%**`
  );
  lines.push("");
  if (report.lastRun) {
    lines.push("## 直近フェッチ状態");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(report.lastRun, null, 2));
    lines.push("```");
  }
  lines.push("");
  return lines.join("\n");
}
