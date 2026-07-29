import fs from "fs";
import path from "path";
import type { ApiUsageRecord, ApiUsageStore } from "@/types/api-usage";

function getUsageFile(): string {
  return path.join(process.cwd(), "data", "api-usage.json");
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readStore(): ApiUsageStore {
  const file = getUsageFile();
  if (!fs.existsSync(file)) return { records: [] };
  const raw = fs.readFileSync(file, "utf-8");
  if (!raw.trim()) return { records: [] };
  return JSON.parse(raw) as ApiUsageStore;
}

function saveStore(store: ApiUsageStore): void {
  const file = getUsageFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2), "utf-8");
}

export function getTodayUsageRecord(): ApiUsageRecord {
  const store = readStore();
  const date = todayKey();
  return (
    store.records.find((record) => record.date === date) ?? {
      date,
      userLookupRequests: 0,
      timelineRequests: 0,
      postsRead: 0,
      acceptedPosts: 0,
    }
  );
}

export function recordApiUsage(delta: {
  userLookupRequests?: number;
  timelineRequests?: number;
  postsRead?: number;
  acceptedPosts?: number;
}): ApiUsageRecord {
  const store = readStore();
  const date = todayKey();
  const index = store.records.findIndex((record) => record.date === date);
  const current =
    index >= 0
      ? store.records[index]
      : {
          date,
          userLookupRequests: 0,
          timelineRequests: 0,
          postsRead: 0,
          acceptedPosts: 0,
        };

  const next: ApiUsageRecord = {
    date,
    userLookupRequests:
      current.userLookupRequests + (delta.userLookupRequests ?? 0),
    timelineRequests: current.timelineRequests + (delta.timelineRequests ?? 0),
    postsRead: current.postsRead + (delta.postsRead ?? 0),
    acceptedPosts: current.acceptedPosts + (delta.acceptedPosts ?? 0),
  };

  if (index >= 0) {
    store.records[index] = next;
  } else {
    store.records.push(next);
  }

  saveStore(store);
  return next;
}

export function getAllUsageRecords(): ApiUsageRecord[] {
  return readStore().records;
}
