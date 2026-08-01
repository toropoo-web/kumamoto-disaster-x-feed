import { stripHtml, truncateSummary } from "@/lib/filters";
import { CROSS_SEARCH_MUNICIPALITIES } from "@/lib/cross-search-queries";
import { CROSS_SEARCH_SINCE_DATE } from "@/types/cross-search-post";

export type CrossSearchFilterReason =
  | "ACCEPTED"
  | "REJECTED_BEFORE_SINCE_DATE"
  | "REJECTED_EMPTY_TEXT"
  | "REJECTED_MISSING_HANDLE"
  | "REJECTED_OUT_OF_MUNICIPALITY_SCOPE";

export type CrossSearchFilterResult = {
  pass: boolean;
  reason: CrossSearchFilterReason;
  regions: string[];
};

function normalizeText(text: string): string {
  return stripHtml(text).replace(/\s+/g, " ").trim();
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

  return regions;
}

export function hasMunicipalityScope(regions: string[]): boolean {
  return regions.some(function (region) {
    return (CROSS_SEARCH_MUNICIPALITIES as readonly string[]).includes(region);
  });
}

export function evaluateCrossSearchPost(input: {
  text: string;
  postedAt: string;
  accountHandle?: string | null;
}): CrossSearchFilterResult {
  const text = normalizeText(input.text);
  const regions = detectCrossSearchRegions(text);

  if (!text) {
    return { pass: false, reason: "REJECTED_EMPTY_TEXT", regions };
  }
  if (!isOnOrAfterCrossSearchSinceDate(input.postedAt)) {
    return { pass: false, reason: "REJECTED_BEFORE_SINCE_DATE", regions };
  }
  if (!input.accountHandle) {
    return { pass: false, reason: "REJECTED_MISSING_HANDLE", regions };
  }
  if (!hasMunicipalityScope(regions)) {
    return { pass: false, reason: "REJECTED_OUT_OF_MUNICIPALITY_SCOPE", regions };
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
