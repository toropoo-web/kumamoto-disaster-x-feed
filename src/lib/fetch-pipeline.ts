import type { PostProcessingBreakdown } from "@/types/post-processing";
import type { PostRejectionReason } from "@/types/post-processing";
import {
  isEligibleForPublication,
  stripHtml,
  truncateSummary,
} from "@/lib/filters";
import { hasImage, hasVideo } from "@/lib/fetchers/x-api-mapper";
import type { RawXPost } from "@/lib/fetchers/types";
import type {
  OfficialPost,
  PostCategory,
  PostPriority,
  PostStatus,
} from "@/types/post";
import { REGION_OPTIONS } from "@/types/post";
import type { Source } from "@/types/source";
import { removeSeedPlaceholderPosts } from "@/lib/seed-posts";

function detectCategory(text: string): PostCategory {
  const t = text.toLowerCase();
  if (/避難所|避難指示|避難勧告|避難/.test(t)) return "EVACUATION_SHELTER";
  if (/地震|津波|震度|余震/.test(t)) return "EARTHQUAKE_TSUNAMI";
  if (/自衛隊|救助|災害派遣|派遣/.test(t)) return "RESCUE_JSDF";
  if (/断水|給水|水道/.test(t)) return "WATER";
  if (/通行止め|道路|交通|運休/.test(t)) return "ROAD_TRANSPORT";
  if (/停電|電力/.test(t)) return "POWER";
  if (/医療|病院|救急/.test(t)) return "MEDICAL_SUPPORT";
  if (/政府|内閣|会見|対応/.test(t)) return "GOVERNMENT_RESPONSE";
  return "OTHER";
}

function detectPriority(text: string, category: PostCategory): PostPriority {
  const t = text.toLowerCase();
  if (/津波|震度7|大規模避難|緊急/.test(t)) return "EMERGENCY";
  if (
    category !== "OTHER" ||
    /避難|断水|停電|通行止め|救助/.test(t)
  ) {
    return "HIGH";
  }
  return "NORMAL";
}

function detectRegions(text: string, sourceRegion: string): string[] {
  const regions = REGION_OPTIONS.filter((region) => text.includes(region));
  if (regions.length > 0) return [...regions];
  return [sourceRegion];
}

export function buildPostUrl(accountHandle: string, postId: string): string {
  return `https://x.com/${accountHandle}/status/${postId}`;
}

function buildTitle(text: string): string {
  const clean = stripHtml(text).trim();
  const line = clean.split(/\n/)[0]?.trim() ?? clean;
  return truncateSummary(line, 80);
}

function buildSummary(text: string): string {
  return truncateSummary(stripHtml(text), 200);
}

function buildPostId(sourceId: string, postId: string): string {
  return `POST-${sourceId}-${postId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function classifyRawPost(
  raw: RawXPost,
  source: Source,
  fetchedAt: string
): { post: OfficialPost | null; reason: PostRejectionReason } {
  const accountHandle = source.accountHandle;
  if (!accountHandle) {
    return { post: null, reason: "REJECTED_MISSING_HANDLE" };
  }
  if (!raw.id) {
    return { post: null, reason: "REJECTED_MISSING_ID" };
  }

  const text = stripHtml(raw.text).trim();
  if (!text || isUrlOnlyPost(text)) {
    return { post: null, reason: "REJECTED_INVALID_POST" };
  }
  if (!isEligibleForPublication(text, accountHandle)) {
    return { post: null, reason: "REJECTED_BY_CONTENT_FILTER" };
  }

  const category = detectCategory(text);
  const priority = detectPriority(text, category);

  return {
    post: {
      postId: buildPostId(source.sourceId, raw.id),
      sourceId: source.sourceId,
      sourceName: source.displayName,
      accountHandle,
      postUrl: buildPostUrl(accountHandle, raw.id),
      postedAt: raw.createdAt,
      fetchedAt,
      title: buildTitle(text),
      summary: buildSummary(text),
      regions: detectRegions(text, source.region),
      category,
      priority,
      status: "ACTIVE" as PostStatus,
      hasImage: hasImage(raw.media),
      hasVideo: hasVideo(raw.media),
    },
    reason: "ACCEPTED",
  };
}

export function rawPostToOfficialPost(
  raw: RawXPost,
  source: Source,
  fetchedAt: string
): OfficialPost | null {
  return classifyRawPost(raw, source, fetchedAt).post;
}

export function applyContentFilterBreakdown(
  raws: RawXPost[],
  source: Source,
  fetchedAt: string,
  base: PostProcessingBreakdown
): { posts: OfficialPost[]; breakdown: PostProcessingBreakdown } {
  const breakdown = { ...base };
  const posts: OfficialPost[] = [];

  for (const raw of raws) {
    const { post, reason } = classifyRawPost(raw, source, fetchedAt);
    switch (reason) {
      case "ACCEPTED":
        if (post) posts.push(post);
        breakdown.accepted += 1;
        break;
      case "REJECTED_BY_CONTENT_FILTER":
        breakdown.rejectedByContentFilter += 1;
        break;
      case "REJECTED_INVALID_POST":
        breakdown.rejectedInvalidPost += 1;
        break;
      case "REJECTED_MISSING_HANDLE":
        breakdown.rejectedMissingHandle += 1;
        break;
      case "REJECTED_MISSING_ID":
        breakdown.rejectedMissingId += 1;
        break;
      default:
        breakdown.processingError += 1;
        break;
    }
  }

  return { posts, breakdown };
}

export function isUrlOnlyPost(text: string): boolean {
  const stripped = text.trim();
  return /^https?:\/\/\S+$/i.test(stripped);
}

export function dedupePostsByUrl(posts: OfficialPost[]): OfficialPost[] {
  const seen = new Set<string>();
  const result: OfficialPost[] = [];

  for (const post of posts) {
    if (seen.has(post.postUrl)) continue;
    seen.add(post.postUrl);
    result.push(post);
  }

  return result;
}

export function mergePosts(
  existing: OfficialPost[],
  incoming: OfficialPost[]
): OfficialPost[] {
  const byUrl = new Map<string, OfficialPost>();

  for (const post of removeSeedPlaceholderPosts(existing)) {
    byUrl.set(post.postUrl, post);
  }

  for (const post of incoming) {
    byUrl.set(post.postUrl, post);
  }

  return dedupePostsByUrl(
    Array.from(byUrl.values()).sort(
      (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
    )
  );
}

export function countNewPosts(
  existing: OfficialPost[],
  incoming: OfficialPost[]
): number {
  const existingUrls = new Set(existing.map((post) => post.postUrl));
  return incoming.filter((post) => !existingUrls.has(post.postUrl)).length;
}
