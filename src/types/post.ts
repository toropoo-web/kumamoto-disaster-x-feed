export type PostCategory =
  | "EARTHQUAKE_TSUNAMI"
  | "EVACUATION_SHELTER"
  | "RESCUE_JSDF"
  | "WATER"
  | "ROAD_TRANSPORT"
  | "POWER"
  | "MEDICAL_SUPPORT"
  | "GOVERNMENT_RESPONSE"
  | "OTHER";

export type PostPriority = "EMERGENCY" | "HIGH" | "NORMAL";

export type PostStatus = "ACTIVE" | "UPDATED" | "RESOLVED" | "UNKNOWN";

export type OfficialPost = {
  postId: string;
  sourceId: string;
  sourceName: string;
  accountHandle: string;
  postUrl: string;
  postedAt: string;
  fetchedAt: string;
  title: string;
  summary: string;
  regions: string[];
  category: PostCategory;
  priority: PostPriority;
  status: PostStatus;
  previousPostId?: string;
  relatedPostIds?: string[];
  hasImage: boolean;
  hasVideo: boolean;
  isDemo?: boolean;
};

export const CATEGORY_LABELS: Record<PostCategory, string> = {
  EARTHQUAKE_TSUNAMI: "地震・津波",
  EVACUATION_SHELTER: "避難・避難所",
  RESCUE_JSDF: "救助・自衛隊",
  WATER: "断水・給水",
  ROAD_TRANSPORT: "道路・交通",
  POWER: "停電",
  MEDICAL_SUPPORT: "医療",
  GOVERNMENT_RESPONSE: "政府対応",
  OTHER: "その他",
};

export const ALL_CATEGORIES: PostCategory[] = [
  "EARTHQUAKE_TSUNAMI",
  "EVACUATION_SHELTER",
  "RESCUE_JSDF",
  "WATER",
  "ROAD_TRANSPORT",
  "POWER",
  "MEDICAL_SUPPORT",
  "GOVERNMENT_RESPONSE",
  "OTHER",
];

export const REGION_OPTIONS = [
  "熊本県",
  "宇城市",
  "宇土市",
  "八代市",
  "氷川町",
  "全国",
] as const;

export const IMPORTANT_CATEGORIES: PostCategory[] = [
  "EVACUATION_SHELTER",
  "EARTHQUAKE_TSUNAMI",
  "RESCUE_JSDF",
  "WATER",
  "ROAD_TRANSPORT",
  "POWER",
  "MEDICAL_SUPPORT",
];

export const MAX_IMPORTANT_POSTS = 10;

export const EMPTY_POSTS_MESSAGE = "現在、掲載中の公式投稿はありません。";

export const EMPTY_HOME_POSTS_MESSAGE =
  "現在表示できる公式投稿はありません。監視対象の公式Xを直接確認してください。";

export const EMPTY_IMPORTANT_POSTS_MESSAGE =
  "現在、掲載中の重要情報はありません。";

export type FetchState = {
  lastAttemptAt: string | null;
  lastSuccessfulFetchAt: string | null;
  sourceCount: number;
  successfulSourceCount: number;
  failedSourceCount: number;
  fetchedPostCount: number;
  acceptedPostCount: number;
  storedPostCount: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "NOT_RUN";
};
