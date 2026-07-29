export type ApiUsageRecord = {
  date: string;
  userLookupRequests: number;
  timelineRequests: number;
  postsRead: number;
  acceptedPosts: number;
};

export type ApiUsageStore = {
  records: ApiUsageRecord[];
};
