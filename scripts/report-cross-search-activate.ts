import fs from "node:fs";
import path from "node:path";
import {
  buildCrossSearchQueries,
  listOfficialAccountHandles,
  OFFICIAL_ACCOUNT_CLASSIFICATION,
} from "../src/lib/cross-search-queries";
import type { CrossSearchPost } from "../src/types/cross-search-post";
import type { OfficialPost } from "../src/types/post";

const ROOT = path.resolve(import.meta.dirname, "..");
const CROSS_SEARCH_POSTS_FILE = path.join(ROOT, "data", "posts-cross-search.json");
const OFFICIAL_POSTS_FILE = path.join(ROOT, "data", "posts.json");
const X_FEED_PREVIEW_FILE = path.join(
  ROOT,
  "..",
  "Kumamoto",
  "data",
  "public",
  "x_feed_preview.json"
);

const SEARCH_KEYWORDS = [
  "給水",
  "支援物資",
  "炊き出し",
  "風呂",
  "車中泊",
  "ペット",
];

type PosterBucket =
  | "municipality"
  | "national"
  | "disaster_agency"
  | "business"
  | "store"
  | "organization"
  | "individual";

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function normalizeHandle(handle: string): string {
  return handle.replace(/^@/, "").toLowerCase();
}

function classifyPoster(post: CrossSearchPost): PosterBucket {
  const handle = normalizeHandle(post.accountHandle);
  const display = String(post.authorDisplayName || "").trim();
  const text = `${display} ${post.content}`;

  if (
    OFFICIAL_ACCOUNT_CLASSIFICATION.municipality
      .map(normalizeHandle)
      .includes(handle)
  ) {
    return "municipality";
  }
  if (
    OFFICIAL_ACCOUNT_CLASSIFICATION.national
      .map(normalizeHandle)
      .includes(handle)
  ) {
    return "national";
  }
  if (
    OFFICIAL_ACCOUNT_CLASSIFICATION.prefecture
      .map(normalizeHandle)
      .includes(handle) ||
    /防災|消防|気象|内閣|防衛/.test(display)
  ) {
    return "disaster_agency";
  }
  if (/市$|町$|村$|区$/.test(display) || /市役所|町役場|村役場/.test(text)) {
    return "municipality";
  }
  if (/株式会社|（株）|\(株\)|Inc\.|Corp/.test(text)) {
    return "business";
  }
  if (/店|ショップ|ストア|カフェ|食堂|スーパー/.test(text)) {
    return "store";
  }
  if (/NPO|団体|協会|ボランティア|基金|組合/.test(text)) {
    return "organization";
  }
  return "individual";
}

function countKeywordMatches(posts: CrossSearchPost[], keyword: string): number {
  return posts.filter(function (post) {
    return post.content.indexOf(keyword) !== -1 || post.title.indexOf(keyword) !== -1;
  }).length;
}

function main(): void {
  const posts = readJson<CrossSearchPost[]>(CROSS_SEARCH_POSTS_FILE, []);
  const officialPosts = readJson<OfficialPost[]>(OFFICIAL_POSTS_FILE, []);
  const preview = readJson<{ section_title?: string; source_feed_url?: string } | null>(
    X_FEED_PREVIEW_FILE,
    null
  );
  const queries = buildCrossSearchQueries();

  const distribution = {
    municipality: 0,
    national: 0,
    disaster_agency: 0,
    business: 0,
    store: 0,
    organization: 0,
    individual: 0,
  };
  posts.forEach(function (post) {
    distribution[classifyPoster(post)] += 1;
  });

  const withSourceId = posts.filter(function (post) {
    return Boolean((post as { sourceId?: string }).sourceId);
  });
  const unregisteredCount = posts.filter(function (post) {
    return !listOfficialAccountHandles().includes(normalizeHandle(post.accountHandle));
  }).length;

  const searchCounts = Object.fromEntries(
    SEARCH_KEYWORDS.map(function (keyword) {
      return [keyword, countKeywordMatches(posts, keyword)];
    })
  );

  const layerChecks = {
    official_public_info: {
      pass: true,
      note: "portal layer unchanged in upstream activation",
    },
    x_cross_search: {
      pass:
        posts.length > 0 &&
        withSourceId.length === 0 &&
        unregisteredCount > 0,
      post_count: posts.length,
      source_id_count: withSourceId.length,
      unregistered_count: unregisteredCount,
    },
    official_x_feed: {
      pass:
        officialPosts.length > 0 &&
        officialPosts.every(function (post) {
          return typeof post.sourceId === "string";
        }) &&
        (preview === null ||
          /posts\.json$/.test(String(preview.source_feed_url || ""))),
      official_post_count: officialPosts.length,
      preview_section_title: preview?.section_title || null,
    },
    municipality_summary: {
      pass: true,
      note: "portal layer unchanged in upstream activation",
    },
  };

  const result = {
    phase: "X_CROSS_SEARCH_FEED_ACTIVATE",
    status: layerChecks.x_cross_search.pass ? "COMPLETE" : "PENDING_DATA",
    posts_cross_search_count: posts.length,
    query_count: queries.length,
    open_query_count: queries.filter(function (query) {
      return query.queryType === "OPEN";
    }).length,
    poster_distribution: distribution,
    search_counts: searchCounts,
    layer_checks: layerChecks,
    queries: queries.map(function (query) {
      return {
        id: query.id,
        type: query.queryType,
        length: query.query.length,
      };
    }),
  };

  console.log(JSON.stringify(result, null, 2));
  if (!layerChecks.x_cross_search.pass) {
    process.exit(1);
  }
}

main();
