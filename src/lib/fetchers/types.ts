import type { SourceRuntimeState } from "@/types/source-runtime";
import type { Source } from "@/types/source";

export type RawXPostMedia = {
  mediaKey: string;
  type: "photo" | "video" | "animated_gif";
  url?: string;
  previewImageUrl?: string;
};

export type RawXPostReference = {
  type: "replied_to" | "quoted" | "retweeted";
  id: string;
};

export type RawXPost = {
  id: string;
  text: string;
  authorId: string;
  createdAt: string;
  media?: RawXPostMedia[];
  referencedPosts?: RawXPostReference[];
};

import type { PostProcessingBreakdown } from "@/types/post-processing";
import { createEmptyBreakdown } from "@/types/post-processing";

export type FetchLatestPostsResult = {
  posts: RawXPost[];
  newestPostId: string | null;
  apiPostCount: number;
  paginationPartial: boolean;
  breakdown: PostProcessingBreakdown;
};

export interface XPostFetcher {
  resolveUserId?(
    source: Source,
    runtimeState?: SourceRuntimeState
  ): Promise<string>;

  fetchLatestPosts(
    source: Source,
    runtimeState?: SourceRuntimeState
  ): Promise<FetchLatestPostsResult>;
}
