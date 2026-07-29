import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/config";
import { getAllSources } from "@/lib/sources";
import { ALL_CATEGORIES, REGION_OPTIONS } from "@/types/post";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const now = new Date();

  const staticPages = ["", "/posts", "/sources"].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "hourly" as const,
    priority: path === "" ? 1 : 0.8,
  }));

  const sourcePages = getAllSources().map((source) => ({
    url: `${base}/sources/${source.sourceId}`,
    lastModified: now,
    changeFrequency: "hourly" as const,
    priority: 0.7,
  }));

  const regionPages = REGION_OPTIONS.map((region) => ({
    url: `${base}/regions/${encodeURIComponent(region)}`,
    lastModified: now,
    changeFrequency: "hourly" as const,
    priority: 0.6,
  }));

  const categoryPages = ALL_CATEGORIES.map((category) => ({
    url: `${base}/categories/${category}`,
    lastModified: now,
    changeFrequency: "hourly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...sourcePages, ...regionPages, ...categoryPages];
}
