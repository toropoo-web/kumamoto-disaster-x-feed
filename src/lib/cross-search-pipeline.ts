import {
  buildCrossSearchPostId,
  buildCrossSearchPostUrl,
  buildCrossSearchSummary,
  buildCrossSearchTitle,
  evaluateCrossSearchPost,
} from "@/lib/cross-search-filters";
import {
  buildUserMap,
  hasImage,
  hasVideo,
  type XSearchMedia,
  type XSearchTweet,
  type XSearchTweetResponse,
} from "@/lib/fetchers/x-search-client";
import {
  CROSS_SEARCH_ACQUISITION_MODE,
  type CrossSearchPost,
} from "@/types/cross-search-post";

export type CrossSearchMappedResult = {
  post: CrossSearchPost | null;
  reason: string;
};

function getReferencedTypes(tweet: XSearchTweet): string[] {
  return (tweet.referenced_tweets ?? []).map(function (ref) {
    return ref.type;
  });
}

function getMediaForTweet(
  tweet: XSearchTweet,
  mediaByKey: Map<string, XSearchMedia>
): XSearchMedia[] {
  const mediaKeys = tweet.attachments?.media_keys ?? [];
  return mediaKeys
    .map(function (key) {
      return mediaByKey.get(key);
    })
    .filter((item): item is XSearchMedia => Boolean(item));
}

export function mapSearchTweetToCrossSearchPost(
  tweet: XSearchTweet,
  usersById: Map<string, { username?: string; name?: string }>,
  mediaByKey: Map<string, XSearchMedia>,
  fetchedAt: string,
  searchQueryId: string
): CrossSearchMappedResult {
  const author = tweet.author_id ? usersById.get(tweet.author_id) : undefined;
  const accountHandle = author?.username ?? "";
  const text = tweet.text ?? "";
  const postedAt = tweet.created_at ?? "";
  const evaluation = evaluateCrossSearchPost({
    text,
    postedAt,
    accountHandle,
    referencedTypes: getReferencedTypes(tweet),
  });

  if (!evaluation.pass) {
    return { post: null, reason: evaluation.reason };
  }

  const media = getMediaForTweet(tweet, mediaByKey);
  const title = buildCrossSearchTitle(text);
  const summary = buildCrossSearchSummary(text);

  return {
    post: {
      postId: buildCrossSearchPostId(tweet.id),
      postUrl: buildCrossSearchPostUrl(accountHandle, tweet.id),
      postedAt,
      fetchedAt,
      title,
      summary,
      content: text,
      accountHandle,
      authorDisplayName: author?.name,
      regions: evaluation.regions,
      status: "ACTIVE",
      acquisition_mode: CROSS_SEARCH_ACQUISITION_MODE,
      hasImage: hasImage(media),
      hasVideo: hasVideo(media),
      searchQueryId,
    },
    reason: "ACCEPTED",
  };
}

export function mapSearchResponseToCrossSearchPosts(
  response: XSearchTweetResponse,
  fetchedAt: string,
  searchQueryId: string
): { posts: CrossSearchPost[]; apiPostCount: number; rejected: number } {
  const usersById = buildUserMap(response.includes?.users);
  const mediaByKey = new Map(
    (response.includes?.media ?? []).map(function (media) {
      return [media.media_key, media];
    })
  );
  const tweets = response.data ?? [];
  const posts: CrossSearchPost[] = [];
  let rejected = 0;

  for (const tweet of tweets) {
    const mapped = mapSearchTweetToCrossSearchPost(
      tweet,
      usersById,
      mediaByKey,
      fetchedAt,
      searchQueryId
    );
    if (mapped.post) {
      posts.push(mapped.post);
    } else {
      rejected += 1;
    }
  }

  return {
    posts,
    apiPostCount: tweets.length,
    rejected,
  };
}

export function mergeCrossSearchPosts(
  existing: CrossSearchPost[],
  incoming: CrossSearchPost[]
): CrossSearchPost[] {
  const byPostId = new Map<string, CrossSearchPost>();
  existing.forEach(function (post) {
    byPostId.set(post.postId, post);
  });
  incoming.forEach(function (post) {
    byPostId.set(post.postId, post);
  });
  return Array.from(byPostId.values()).sort(function (a, b) {
    return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
  });
}

export function countUnregisteredAccountPosts(
  posts: CrossSearchPost[],
  registeredHandles: string[]
): number {
  const registered = new Set(
    registeredHandles.map(function (handle) {
      return handle.toLowerCase();
    })
  );
  return posts.filter(function (post) {
    return !registered.has(post.accountHandle.replace(/^@/, "").toLowerCase());
  }).length;
}
