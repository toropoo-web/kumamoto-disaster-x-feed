import type { RawXPost, RawXPostMedia } from "@/lib/fetchers/types";
import type { PostProcessingBreakdown } from "@/types/post-processing";
import { createEmptyBreakdown } from "@/types/post-processing";
import type { XApiMedia, XApiTweet, XApiTweetResponse } from "./x-api-client";

export type TweetPageProcessing = {
  posts: RawXPost[];
  breakdown: PostProcessingBreakdown;
};

export function processTweetResponse(
  response: XApiTweetResponse,
  authorId: string
): TweetPageProcessing {
  const breakdown = createEmptyBreakdown();
  const tweets = response.data ?? [];
  breakdown.apiPostCount = tweets.length;

  const mediaByKey = new Map(
    (response.includes?.media ?? []).map((media) => [media.media_key, media])
  );

  const posts: RawXPost[] = [];
  for (const tweet of tweets) {
    if (isReply(tweet)) {
      breakdown.rejectedReply += 1;
      continue;
    }
    if (isRepost(tweet)) {
      breakdown.rejectedRepost += 1;
      continue;
    }
    if (!tweet.id) {
      breakdown.rejectedMissingId += 1;
      continue;
    }
    posts.push(mapTweet(tweet, authorId, mediaByKey));
  }

  return { posts, breakdown };
}

export function mapTweetResponseToRawPosts(
  response: XApiTweetResponse,
  authorId: string
): RawXPost[] {
  return processTweetResponse(response, authorId).posts;
}

export function getNewestPostId(posts: RawXPost[]): string | null {
  if (posts.length === 0) return null;
  return posts
    .map((post) => post.id)
    .sort((a, b) => (BigInt(a) > BigInt(b) ? -1 : 1))[0];
}

export function getNewestPostIdFromResponse(
  response: XApiTweetResponse,
  posts: RawXPost[]
): string | null {
  if (response.meta?.newest_id) return response.meta.newest_id;
  return getNewestPostId(posts);
}

function mapTweet(
  tweet: XApiTweet,
  authorId: string,
  mediaByKey: Map<string, XApiMedia>
): RawXPost {
  const mediaKeys = tweet.attachments?.media_keys ?? [];
  const media = mediaKeys
    .map((key) => mediaByKey.get(key))
    .filter((item): item is XApiMedia => Boolean(item))
    .map(mapMedia);

  const referencedPosts = (tweet.referenced_tweets ?? []).map((ref) => ({
    type: normalizeReferenceType(ref.type),
    id: ref.id,
  }));

  return {
    id: tweet.id,
    text: tweet.text,
    authorId,
    createdAt: tweet.created_at ?? new Date(0).toISOString(),
    media: media.length > 0 ? media : undefined,
    referencedPosts: referencedPosts.length > 0 ? referencedPosts : undefined,
  };
}

function mapMedia(media: XApiMedia): RawXPostMedia {
  return {
    mediaKey: media.media_key,
    type: media.type,
    url: media.url,
    previewImageUrl: media.preview_image_url,
  };
}

function normalizeReferenceType(
  type: string
): "replied_to" | "quoted" | "retweeted" {
  if (type === "retweeted") return "retweeted";
  if (type === "quoted") return "quoted";
  return "replied_to";
}

function isReply(tweet: XApiTweet): boolean {
  return (tweet.referenced_tweets ?? []).some((ref) => ref.type === "replied_to");
}

function isRepost(tweet: XApiTweet): boolean {
  return (tweet.referenced_tweets ?? []).some((ref) => ref.type === "retweeted");
}

export function hasImage(media?: RawXPostMedia[]): boolean {
  return media?.some((item) => item.type === "photo") ?? false;
}

export function hasVideo(media?: RawXPostMedia[]): boolean {
  return (
    media?.some(
      (item) => item.type === "video" || item.type === "animated_gif"
    ) ?? false
  );
}

export function dedupeRawPostsWithStats(posts: RawXPost[]): {
  posts: RawXPost[];
  duplicateCount: number;
} {
  const byId = new Map<string, RawXPost>();
  let duplicateCount = 0;
  for (const post of posts) {
    if (byId.has(post.id)) {
      duplicateCount += 1;
      continue;
    }
    byId.set(post.id, post);
  }
  const deduped = Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return { posts: deduped, duplicateCount };
}
