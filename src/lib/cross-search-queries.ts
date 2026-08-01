export const CROSS_SEARCH_MUNICIPALITIES = [
  "熊本市",
  "八代市",
  "水俣市",
  "宇土市",
  "上天草市",
  "宇城市",
  "天草市",
  "美里町",
  "甲佐町",
  "芦北町",
  "津奈木町",
  "苓北町",
  "益城町",
  "御船町",
  "嘉島町",
  "人吉市",
  "菊陽町",
  "菊池市",
  "合志市",
  "氷川町",
  "阿蘇市",
  "南阿蘇村",
  "霧島市",
] as const;

export const DISASTER_QUERY_TERMS = [
  "熊本地震",
  "令和8年熊本地震",
  "地震",
  "被災",
  "災害",
  "支援",
  "給水",
  "断水",
  "避難",
  "復旧",
  "ボランティア",
  "炊き出し",
  "物資",
] as const;

export const CROSS_SEARCH_QUERY_SUFFIX = "-is:retweet lang:ja";
export const CROSS_SEARCH_MAX_QUERY_LENGTH = 512;

export type CrossSearchQuery = {
  id: string;
  query: string;
  municipalityBatch: string[];
  queryType: "SCOPED";
};

function quoteTerm(term: string): string {
  if (/^[#a-zA-Z0-9_]+$/.test(term)) {
    return term;
  }
  return `"${term}"`;
}

function buildClause(terms: readonly string[]): string {
  return `(${terms.map(quoteTerm).join(" OR ")})`;
}

function buildScopedQuery(
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

function resolveMunicipalityBatchSize(): number {
  const suffix = CROSS_SEARCH_QUERY_SUFFIX;
  const disasterClause = buildClause(DISASTER_QUERY_TERMS);
  const overhead = disasterClause.length + suffix.length + 3;
  const maxBatchLength = CROSS_SEARCH_MAX_QUERY_LENGTH - overhead - 4;

  let batchSize = 5;
  while (batchSize > 1) {
    const sample = buildClause(CROSS_SEARCH_MUNICIPALITIES.slice(0, batchSize));
    if (sample.length <= maxBatchLength) {
      break;
    }
    batchSize -= 1;
  }
  return batchSize;
}

export function buildCrossSearchQueries(): CrossSearchQuery[] {
  const queries: CrossSearchQuery[] = [];
  const municipalityBatchSize = resolveMunicipalityBatchSize();

  chunkTerms(CROSS_SEARCH_MUNICIPALITIES, municipalityBatchSize).forEach(
    function (municipalityBatch, index) {
      queries.push({
        id: `MUN-SCOPED-${String(index + 1).padStart(2, "0")}`,
        query: buildScopedQuery(municipalityBatch, DISASTER_QUERY_TERMS),
        municipalityBatch: municipalityBatch.slice(),
        queryType: "SCOPED",
      });
    }
  );

  return queries.filter(function (item) {
    return item.query.length <= CROSS_SEARCH_MAX_QUERY_LENGTH;
  });
}

export function resolveQueriesForScheduledRun(
  queries: CrossSearchQuery[],
  options?: { now?: Date; runAll?: boolean }
): CrossSearchQuery[] {
  if (!queries.length) {
    return [];
  }
  if (options?.runAll) {
    return queries.slice();
  }
  const now = options?.now ?? new Date();
  const slot = Math.floor(now.getTime() / (30 * 60 * 1000));
  const index = slot % queries.length;
  return [queries[index]];
}

export const OFFICIAL_ACCOUNT_CLASSIFICATION = {
  national: [
    "Kantei_Saigai",
    "CAO_BOUSAI",
    "JMA_bousai",
    "FDMA_JAPAN",
    "ModJapan_saigai",
    "ModJapan_jp",
  ],
  prefecture: ["Bousai_Kumamoto"],
  municipality: [
    "kumamotocity_",
    "yatsushiro0801",
    "hitoyoshishi",
    "Koshi_city",
  ],
} as const;

export function listOfficialAccountHandles(): string[] {
  return [
    ...OFFICIAL_ACCOUNT_CLASSIFICATION.national,
    ...OFFICIAL_ACCOUNT_CLASSIFICATION.prefecture,
    ...OFFICIAL_ACCOUNT_CLASSIFICATION.municipality,
  ].map(function (handle) {
    return handle.toLowerCase();
  });
}
