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

export const CROSS_SEARCH_REGIONAL_TERMS = [
  "熊本県",
  "熊本",
  "南九州",
  "九州南部",
] as const;

export const CROSS_SEARCH_DISASTER_TERMS = [
  "熊本地震",
  "令和8年熊本地震",
  "令和８年熊本地震",
  "#令和8年熊本地震",
  "熊本",
  "熊本県",
  "地震",
  "震度",
  "被災",
  "災害",
] as const;

export const CROSS_SEARCH_SUPPORT_TERMS = [
  "給水",
  "水",
  "支援物資",
  "炊き出し",
  "食料",
  "風呂",
  "シャワー",
  "車中泊",
  "Wi-Fi",
  "ペット",
  "迷子",
  "無料開放",
  "避難",
  "充電",
  "氷",
  "冷却",
] as const;

export const CROSS_SEARCH_QUERY_SUFFIX = "-is:retweet lang:ja";
export const CROSS_SEARCH_MAX_QUERY_LENGTH = 512;

export type CrossSearchQuery = {
  id: string;
  query: string;
  municipalityBatch: string[];
  queryType: "MUNICIPALITY" | "REGIONAL" | "SUPPORT";
};

function quoteTerm(term: string): string {
  if (/^[#a-zA-Z0-9_]+$/.test(term)) {
    return term;
  }
  return `"${term}"`;
}

function buildDisasterClause(): string {
  return `(${CROSS_SEARCH_DISASTER_TERMS.map(quoteTerm).join(" OR ")})`;
}

function buildLocationClause(terms: readonly string[]): string {
  return `(${terms.map(quoteTerm).join(" OR ")})`;
}

function buildQuery(
  locationTerms: readonly string[],
  supportTerms?: readonly string[]
): string {
  const parts = [buildDisasterClause(), buildLocationClause(locationTerms)];
  if (supportTerms && supportTerms.length > 0) {
    parts.push(buildLocationClause(supportTerms));
  }
  return `${parts.join(" ")} ${CROSS_SEARCH_QUERY_SUFFIX}`;
}

function chunkTerms<T>(terms: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < terms.length; index += size) {
    batches.push(terms.slice(index, index + size));
  }
  return batches;
}

function resolveMunicipalityBatchSize(): number {
  const disasterClause = buildDisasterClause();
  const suffix = CROSS_SEARCH_QUERY_SUFFIX;
  const overhead = disasterClause.length + suffix.length + 2;
  const maxBatchLength = CROSS_SEARCH_MAX_QUERY_LENGTH - overhead - 4;

  let batchSize = 4;
  while (batchSize > 1) {
    const sample = buildLocationClause(
      CROSS_SEARCH_MUNICIPALITIES.slice(0, batchSize)
    );
    if (sample.length <= maxBatchLength) {
      break;
    }
    batchSize -= 1;
  }
  return batchSize;
}

function resolveSupportBatchSize(): number {
  const sampleQuery = buildQuery(
    ["熊本県", "熊本"],
    CROSS_SEARCH_SUPPORT_TERMS.slice(0, 4)
  );
  if (sampleQuery.length <= CROSS_SEARCH_MAX_QUERY_LENGTH) {
    return 4;
  }
  return 3;
}

export function buildCrossSearchQueries(): CrossSearchQuery[] {
  const queries: CrossSearchQuery[] = [];
  const municipalityBatchSize = resolveMunicipalityBatchSize();

  chunkTerms(CROSS_SEARCH_MUNICIPALITIES, municipalityBatchSize).forEach(
    function (municipalityBatch, index) {
      queries.push({
        id: `MUN-BATCH-${String(index + 1).padStart(2, "0")}`,
        query: buildQuery(municipalityBatch),
        municipalityBatch: municipalityBatch.slice(),
        queryType: "MUNICIPALITY",
      });
    }
  );

  queries.push({
    id: "REGIONAL",
    query: buildQuery(CROSS_SEARCH_REGIONAL_TERMS),
    municipalityBatch: [],
    queryType: "REGIONAL",
  });

  const supportBatchSize = resolveSupportBatchSize();
  chunkTerms(CROSS_SEARCH_SUPPORT_TERMS, supportBatchSize).forEach(function (
    supportBatch,
    index
  ) {
    queries.push({
      id: `SUPPORT-BATCH-${String(index + 1).padStart(2, "0")}`,
      query: buildQuery(CROSS_SEARCH_REGIONAL_TERMS, supportBatch),
      municipalityBatch: [],
      queryType: "SUPPORT",
    });
  });

  return queries.filter(function (item) {
    return item.query.length <= CROSS_SEARCH_MAX_QUERY_LENGTH;
  });
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
