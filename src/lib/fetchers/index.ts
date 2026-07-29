export type { RawXPost, RawXPostMedia, RawXPostReference, XPostFetcher, FetchLatestPostsResult } from "./types";
export { MockXPostFetcher } from "./mock";
export { XApiPostFetcher } from "./x-api";
export { XApiClient } from "./x-api-client";
export { hasImage, hasVideo } from "./x-api-mapper";

import { MockXPostFetcher } from "./mock";
import { XApiPostFetcher } from "./x-api";
import { loadXApiConfigFromEnv } from "@/types/x-api";
import type { XPostFetcher } from "./types";

export function createDefaultFetcher(): XPostFetcher | null {
  const config = loadXApiConfigFromEnv();
  if (!config) return null;
  return new XApiPostFetcher(config);
}

export function createMockFetcher(): XPostFetcher {
  return new MockXPostFetcher();
}
