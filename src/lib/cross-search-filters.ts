import { EXCLUSION_KEYWORDS, stripHtml, truncateSummary } from "@/lib/filters";
import {
  CROSS_SEARCH_DISASTER_TERMS,
  CROSS_SEARCH_MUNICIPALITIES,
  CROSS_SEARCH_REGIONAL_TERMS,
} from "@/lib/cross-search-queries";
import { CROSS_SEARCH_SINCE_DATE } from "@/types/cross-search-post";

export type CrossSearchFilterReason =
  | "ACCEPTED"
  | "REJECTED_BEFORE_SINCE_DATE"
  | "REJECTED_NOT_DISASTER_RELATED"
  | "REJECTED_NOT_REGION_RELATED"
  | "REJECTED_EXCLUSION_KEYWORD"
  | "REJECTED_EMPTY_TEXT"
  | "REJECTED_RETWEET"
  | "REJECTED_REPLY"
  | "REJECTED_MISSING_HANDLE";

export type CrossSearchFilterResult = {
  pass: boolean;
  reason: CrossSearchFilterReason;
  regions: string[];
};

function normalizeText(text: string): string {
  return stripHtml(text).replace(/\s+/g, " ").trim();
}

function containsAnyKeyword(text: string, keywords: readonly string[]): boolean {
  const normalized = text.toLowerCase();
  return keywords.some(function (keyword) {
    return normalized.includes(keyword.toLowerCase());
  });
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[^\s#]+/g) ?? [];
  return matches.map(function (tag) {
    return tag.trim();
  });
}

export function isOnOrAfterCrossSearchSinceDate(isoDate: string): boolean {
  const postedAt = new Date(isoDate);
  const since = new Date(CROSS_SEARCH_SINCE_DATE);
  if (Number.isNaN(postedAt.getTime())) {
    return false;
  }
  return postedAt >= since;
}

export function detectCrossSearchRegions(text: string): string[] {
  const normalized = normalizeText(text);
  const hashtags = extractHashtags(normalized).join(" ");
  const haystack = `${normalized} ${hashtags}`;
  const regions: string[] = [];

  CROSS_SEARCH_MUNICIPALITIES.forEach(function (municipality) {
    if (haystack.includes(municipality) && regions.indexOf(municipality) === -1) {
      regions.push(municipality);
    }
  });

  CROSS_SEARCH_REGIONAL_TERMS.forEach(function (term) {
    if (haystack.includes(term) && regions.indexOf(term) === -1) {
      regions.push(term);
    }
  });

  return regions;
}

export function isDisasterRelatedText(text: string): boolean {
  return containsAnyKeyword(text, CROSS_SEARCH_DISASTER_TERMS);
}

export function evaluateCrossSearchPost(input: {
  text: string;
  postedAt: string;
  accountHandle?: string | null;
  referencedTypes?: string[];
}): CrossSearchFilterResult {
  const text = normalizeText(input.text);
  const regions = detectCrossSearchRegions(text);

  if (!text) {
    return { pass: false, reason: "REJECTED_EMPTY_TEXT", regions };
  }
  if (!isOnOrAfterCrossSearchSinceDate(input.postedAt)) {
    return { pass: false, reason: "REJECTED_BEFORE_SINCE_DATE", regions };
  }
  if ((input.referencedTypes ?? []).includes("retweeted")) {
    return { pass: false, reason: "REJECTED_RETWEET", regions };
  }
  if ((input.referencedTypes ?? []).includes("replied_to")) {
    return { pass: false, reason: "REJECTED_REPLY", regions };
  }
  if (containsAnyKeyword(text, EXCLUSION_KEYWORDS)) {
    return { pass: false, reason: "REJECTED_EXCLUSION_KEYWORD", regions };
  }
  if (!isDisasterRelatedText(text)) {
    return { pass: false, reason: "REJECTED_NOT_DISASTER_RELATED", regions };
  }
  if (!input.accountHandle) {
    return { pass: false, reason: "REJECTED_MISSING_HANDLE", regions };
  }

  return { pass: true, reason: "ACCEPTED", regions };
}

export function buildCrossSearchTitle(text: string): string {
  const clean = normalizeText(text);
  const line = clean.split(/\n/)[0]?.trim() ?? clean;
  return truncateSummary(line, 80);
}

export function buildCrossSearchSummary(text: string): string {
  return truncateSummary(normalizeText(text), 200);
}

export function buildCrossSearchPostId(tweetId: string): string {
  return `POST-CROSS-${tweetId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function buildCrossSearchPostUrl(
  accountHandle: string,
  tweetId: string
): string {
  return `https://x.com/${accountHandle.replace(/^@/, "")}/status/${tweetId}`;
}
