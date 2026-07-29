import sourcesData from "../../data/sources.json";
import type { Source } from "@/types/source";
import { isPubliclyListedSource } from "@/types/source";

export function getAllSources(): Source[] {
  return sourcesData as Source[];
}

export function getSourceById(sourceId: string): Source | undefined {
  return getAllSources().find((s) => s.sourceId === sourceId);
}

export function getPublicMonitoringSourceList(): Source[] {
  return getAllSources().filter(isPubliclyListedSource);
}

export function getFetchEnabledSources(): Source[] {
  return getAllSources().filter((s) => s.fetchEnabled && s.accountHandle);
}
