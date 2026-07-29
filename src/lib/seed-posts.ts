import type { OfficialPost } from "@/types/post";

export const SEED_PLACEHOLDER_TWEET_ID = "2000000000000000001";
export const SEED_PLACEHOLDER_TEXT = "熊本県宇城市の避難所を開設しました。";

export function isSeedPlaceholderPost(post: OfficialPost): boolean {
  const matchesPlaceholderId =
    post.postId.endsWith(`-${SEED_PLACEHOLDER_TWEET_ID}`) &&
    post.postUrl.includes(`/status/${SEED_PLACEHOLDER_TWEET_ID}`);
  const matchesPlaceholderText =
    post.title === SEED_PLACEHOLDER_TEXT ||
    post.summary === SEED_PLACEHOLDER_TEXT;

  return matchesPlaceholderId && matchesPlaceholderText;
}

export function removeSeedPlaceholderPosts(
  posts: OfficialPost[]
): OfficialPost[] {
  return posts.filter((post) => !isSeedPlaceholderPost(post));
}
