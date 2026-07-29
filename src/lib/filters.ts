import { BOUSAI_KUMAMOTO_HANDLE } from "@/types/source";

export const PUBLICATION_KEYWORDS = [
  "熊本",
  "熊本県",
  "熊本地震",
  "宇城市",
  "宇土市",
  "八代市",
  "氷川町",
  "被災地",
  "災害派遣",
  "救助",
  "避難",
  "避難所",
  "断水",
  "給水",
  "通行止め",
  "停電",
  "地震",
  "津波",
] as const;

export const EXCLUSION_KEYWORDS = [
  "選挙",
  "政党",
  "候補",
  "投票",
  "イベント",
  "お祭り",
  "まつり",
  "キャンペーン",
  "セミナー",
  "募集",
  "一般政策",
] as const;

export function containsKeyword(
  text: string,
  keywords: readonly string[]
): boolean {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

export function isBousaiKumamotoAccount(accountHandle: string): boolean {
  return accountHandle === BOUSAI_KUMAMOTO_HANDLE;
}

export function isEligibleForPublication(
  text: string,
  accountHandle: string
): boolean {
  if (isBousaiKumamotoAccount(accountHandle)) {
    return !containsKeyword(text, EXCLUSION_KEYWORDS);
  }

  if (!containsKeyword(text, PUBLICATION_KEYWORDS)) {
    return false;
  }

  if (containsKeyword(text, EXCLUSION_KEYWORDS)) {
    return false;
  }

  return true;
}

export function truncateSummary(text: string, maxLength = 100): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength);
}

export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

export function isDemoPost(post: { postId: string; title: string; isDemo?: boolean }): boolean {
  if (post.isDemo) return true;
  const combined = `${post.postId} ${post.title}`.toUpperCase();
  return combined.includes("SAMPLE") || combined.includes("DEMO");
}
