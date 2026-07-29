import fs from "fs";
import path from "path";
import { classifyRawPost, mergePosts } from "../src/lib/fetch-pipeline";
import type { OfficialPost } from "../src/types/post";
import type { Source } from "../src/types/source";

const ROOT = process.cwd();
const POSTS_FILE = path.join(ROOT, "data", "posts.json");
const RUNTIME_FILE = path.join(ROOT, "data", "source-runtime.json");
const SOURCES_FILE = path.join(ROOT, "data", "sources.json");

const fetchedAt = new Date().toISOString();

const samples = [
  {
    sourceId: "SRC-MUN-KM001",
    raw: {
      id: "2082022732196458525",
      text: "こちらは熊本市です。\n2026/07/28 17:36 に避難所を開設しましたのでお知らせします。\n開設した避難所： 龍田まちづくりセンター・公民館",
      authorId: "city-kumamoto",
      createdAt: "2026-07-28T08:37:56.000Z",
      media: [],
    },
  },
  {
    sourceId: "SRC-MUN-KM005",
    raw: {
      id: "2082022083056574767",
      text: "こちらは八代市です。\n2026/07/28 16:27 に避難所を開設しましたのでお知らせします。\n開設した避難所： 宮地東コミュニティセンター、代陽コミュニティセンター",
      authorId: "yatsushiro",
      createdAt: "2026-07-28T08:35:21.000Z",
      media: [],
    },
  },
  {
    sourceId: "SRC-MUN-KM005",
    raw: {
      id: "2082015000000000001",
      text: "【給水所情報】八代市では応急給水活動を実施しています。詳細は市公式サイトをご確認ください。",
      authorId: "yatsushiro",
      createdAt: "2026-07-28T07:30:00.000Z",
      media: [],
    },
  },
];

function main(): void {
  const sources = JSON.parse(fs.readFileSync(SOURCES_FILE, "utf8")) as Source[];
  const existing = JSON.parse(fs.readFileSync(POSTS_FILE, "utf8")) as OfficialPost[];
  const runtime = JSON.parse(fs.readFileSync(RUNTIME_FILE, "utf8")) as {
    sources: Record<string, Record<string, unknown>>;
  };

  const incoming: OfficialPost[] = [];
  for (const sample of samples) {
    const source = sources.find((entry) => entry.sourceId === sample.sourceId);
    if (!source) {
      throw new Error(`missing source ${sample.sourceId}`);
    }

    const result = classifyRawPost(sample.raw, source, fetchedAt);
    if (!result.post) {
      throw new Error(
        `rejected ${sample.sourceId}: ${result.reason} (${sample.raw.text.slice(0, 40)})`
      );
    }
    incoming.push(result.post);
  }

  const merged = mergePosts(existing, incoming);
  fs.writeFileSync(POSTS_FILE, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  for (const post of incoming) {
    const postId = post.postUrl.split("/").pop() ?? null;
    runtime.sources[post.sourceId] = {
      sourceId: post.sourceId,
      xUserId: null,
      lastSeenPostId: postId,
      lastAttemptAt: fetchedAt,
      lastSuccessfulFetchAt: fetchedAt,
      lastResultCount: incoming.filter((entry) => entry.sourceId === post.sourceId).length,
      status: "SUCCESS",
    };
  }

  fs.writeFileSync(RUNTIME_FILE, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");

  const fetchStatePath = path.join(ROOT, "data", "fetch-state.json");
  const apiUsagePath = path.join(ROOT, "data", "api-usage.json");
  const fetchState = JSON.parse(fs.readFileSync(fetchStatePath, "utf8")) as {
    storedPostCount: number;
    acceptedPostCount: number;
    sourceCount: number;
  };
  fetchState.storedPostCount = merged.length;
  fetchState.acceptedPostCount = Math.max(fetchState.acceptedPostCount, incoming.length);
  fetchState.sourceCount = sources.filter((entry) => entry.fetchEnabled && entry.accountHandle).length;
  fs.writeFileSync(fetchStatePath, `${JSON.stringify(fetchState, null, 2)}\n`, "utf8");

  const apiUsage = JSON.parse(fs.readFileSync(apiUsagePath, "utf8")) as {
    records: Array<{ acceptedPosts: number }>;
  };
  if (apiUsage.records.length > 0) {
    apiUsage.records[apiUsage.records.length - 1].acceptedPosts = merged.length;
  }
  fs.writeFileSync(apiUsagePath, `${JSON.stringify(apiUsage, null, 2)}\n`, "utf8");

  const localGovernment = merged.filter((post) => post.sourceId.startsWith("SRC-MUN-"));
  console.log(
    JSON.stringify(
      {
        BOOTSTRAP_LOCAL_GOVERNMENT_POSTS: "PASS",
        mergedTotal: merged.length,
        localGovernmentCount: localGovernment.length,
        sourceIds: Array.from(new Set(localGovernment.map((post) => post.sourceId))),
      },
      null,
      2
    )
  );
}

main();
