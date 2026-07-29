import fs from "fs";
import path from "path";
import type {
  SourceRuntimeState,
  SourceRuntimeStore,
} from "@/types/source-runtime";

function getRuntimeFile(): string {
  return path.join(process.cwd(), "data", "source-runtime.json");
}

function readStore(): SourceRuntimeStore {
  const file = getRuntimeFile();
  if (!fs.existsSync(file)) return { sources: {} };
  const raw = fs.readFileSync(file, "utf-8");
  if (!raw.trim()) return { sources: {} };
  return JSON.parse(raw) as SourceRuntimeStore;
}

export function getSourceRuntime(sourceId: string): SourceRuntimeState {
  const store = readStore();
  return (
    store.sources[sourceId] ?? createDefaultRuntime(sourceId)
  );
}

export function getAllSourceRuntime(): SourceRuntimeStore {
  return readStore();
}

export function createDefaultRuntime(sourceId: string): SourceRuntimeState {
  return {
    sourceId,
    xUserId: null,
    lastSeenPostId: null,
    lastAttemptAt: null,
    lastSuccessfulFetchAt: null,
    lastResultCount: 0,
    status: "NOT_CONFIGURED",
  };
}

export function saveSourceRuntimeStore(store: SourceRuntimeStore): void {
  const file = getRuntimeFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2), "utf-8");
}

export function updateSourceRuntime(
  sourceId: string,
  patch: Partial<SourceRuntimeState>
): SourceRuntimeState {
  const store = readStore();
  const current = store.sources[sourceId] ?? createDefaultRuntime(sourceId);
  const next = { ...current, ...patch, sourceId };
  store.sources[sourceId] = next;
  saveSourceRuntimeStore(store);
  return next;
}

export function replaceSourceRuntimeStore(store: SourceRuntimeStore): void {
  saveSourceRuntimeStore(store);
}
