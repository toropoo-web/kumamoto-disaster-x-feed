import fs from "fs";
import path from "path";
import type { OfficialPost, FetchState } from "@/types/post";
import { isDemoPost } from "@/lib/filters";
import { createEmptyFetchState } from "@/lib/fetch-state";
import { IMPORTANT_CATEGORIES, MAX_IMPORTANT_POSTS } from "@/types/post";

function getPostsFile(): string {
  return path.join(process.cwd(), "data", "posts.json");
}

function getFetchStateFile(): string {
  return path.join(process.cwd(), "data", "fetch-state.json");
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, "utf-8");
  if (!raw.trim()) return fallback;
  return JSON.parse(raw) as T;
}

function getVisiblePosts(): OfficialPost[] {
  const posts = readJsonFile<OfficialPost[]>(getPostsFile(), []);
  if (process.env.NODE_ENV === "production") {
    return posts.filter((p) => !isDemoPost(p));
  }
  if (process.env.SHOW_DEMO_POSTS === "false") {
    return posts.filter((p) => !isDemoPost(p));
  }
  return posts;
}

export function getPublishedPosts(): OfficialPost[] {
  return getVisiblePosts().sort(
    (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
  );
}

export function getPostsBySource(sourceId: string): OfficialPost[] {
  return getPublishedPosts().filter((p) => p.sourceId === sourceId);
}

export function getPostsByRegion(region: string): OfficialPost[] {
  return getPublishedPosts().filter((p) => p.regions.includes(region));
}

export function getPostsByCategory(
  category: OfficialPost["category"]
): OfficialPost[] {
  return getPublishedPosts().filter((p) => p.category === category);
}

export function getImportantPosts(): OfficialPost[] {
  return getPublishedPosts()
    .filter(
      (p) =>
        p.status === "ACTIVE" &&
        (p.priority === "EMERGENCY" || p.priority === "HIGH") &&
        IMPORTANT_CATEGORIES.includes(p.category)
    )
    .slice(0, MAX_IMPORTANT_POSTS);
}

export function getLatestPosts(limit = 10): OfficialPost[] {
  return getPublishedPosts().slice(0, limit);
}

export function getFetchState(): FetchState {
  return readJsonFile<FetchState>(getFetchStateFile(), createEmptyFetchState());
}

export function getLastSuccessfulFetchAt(): string | null {
  return getFetchState().lastSuccessfulFetchAt;
}

export function countDemoPostsInProduction(): number {
  if (process.env.NODE_ENV !== "production") return 0;
  const posts = readJsonFile<OfficialPost[]>(getPostsFile(), []);
  return posts.filter((p) => isDemoPost(p)).length;
}
