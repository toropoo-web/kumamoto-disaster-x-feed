export type SourceRuntimeStatus =
  | "SUCCESS"
  | "NO_NEW_POSTS"
  | "FAILED"
  | "NOT_CONFIGURED";

export type SourceRuntimeState = {
  sourceId: string;
  xUserId: string | null;
  lastSeenPostId: string | null;
  lastAttemptAt: string | null;
  lastSuccessfulFetchAt: string | null;
  lastResultCount: number;
  status: SourceRuntimeStatus;
  lastErrorCode?: string;
};

export type SourceRuntimeStore = {
  sources: Record<string, SourceRuntimeState>;
};
