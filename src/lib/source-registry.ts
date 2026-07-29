import { getSourceRuntime } from "@/lib/source-runtime";
import {
  getAllSources,
  getPublicMonitoringSourceList,
} from "@/lib/sources";
import type { Source } from "@/types/source";
import { isPubliclyListedSource } from "@/types/source";

export type MonitoringStatus = "ACTIVE" | "PREPARING";

export type SourceRegistryEntry = {
  source: Source;
  monitoringStatus: MonitoringStatus;
  lastSuccessfulFetchAt: string | null;
  xProfileUrl: string | null;
};

export function getMonitoringStatus(source: Source): MonitoringStatus {
  if (isPubliclyListedSource(source) && source.accountHandle) {
    return "ACTIVE";
  }
  return "PREPARING";
}

export function getSourceRegistryEntries(): SourceRegistryEntry[] {
  return getAllSources().map((source) => ({
    source,
    monitoringStatus: getMonitoringStatus(source),
    lastSuccessfulFetchAt: getSourceRuntime(source.sourceId).lastSuccessfulFetchAt,
    xProfileUrl: source.accountHandle
      ? `https://x.com/${source.accountHandle}`
      : null,
  }));
}

export function countActiveMonitoringSources(): number {
  return getPublicMonitoringSourceList().length;
}

export function countRegisteredSources(): number {
  return getAllSources().length;
}
