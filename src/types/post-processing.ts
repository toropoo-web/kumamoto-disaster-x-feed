export type PostRejectionReason =
  | "ACCEPTED"
  | "REJECTED_BY_CONTENT_FILTER"
  | "REJECTED_REPLY"
  | "REJECTED_REPOST"
  | "REJECTED_INVALID_POST"
  | "REJECTED_DUPLICATE"
  | "REJECTED_MISSING_HANDLE"
  | "REJECTED_MISSING_ID"
  | "ERROR";

export type PostProcessingBreakdown = {
  apiPostCount: number;
  accepted: number;
  rejectedByContentFilter: number;
  rejectedReply: number;
  rejectedRepost: number;
  rejectedInvalidPost: number;
  rejectedDuplicate: number;
  rejectedMissingHandle: number;
  rejectedMissingId: number;
  processingError: number;
};

export function createEmptyBreakdown(): PostProcessingBreakdown {
  return {
    apiPostCount: 0,
    accepted: 0,
    rejectedByContentFilter: 0,
    rejectedReply: 0,
    rejectedRepost: 0,
    rejectedInvalidPost: 0,
    rejectedDuplicate: 0,
    rejectedMissingHandle: 0,
    rejectedMissingId: 0,
    processingError: 0,
  };
}

export function mergeBreakdowns(
  ...items: PostProcessingBreakdown[]
): PostProcessingBreakdown {
  const merged = createEmptyBreakdown();
  for (const item of items) {
    merged.apiPostCount += item.apiPostCount;
    merged.accepted += item.accepted;
    merged.rejectedByContentFilter += item.rejectedByContentFilter;
    merged.rejectedReply += item.rejectedReply;
    merged.rejectedRepost += item.rejectedRepost;
    merged.rejectedInvalidPost += item.rejectedInvalidPost;
    merged.rejectedDuplicate += item.rejectedDuplicate;
    merged.rejectedMissingHandle += item.rejectedMissingHandle;
    merged.rejectedMissingId += item.rejectedMissingId;
    merged.processingError += item.processingError;
  }
  return merged;
}

export function isCountReconciled(breakdown: PostProcessingBreakdown): boolean {
  const accounted =
    breakdown.accepted +
    breakdown.rejectedByContentFilter +
    breakdown.rejectedReply +
    breakdown.rejectedRepost +
    breakdown.rejectedInvalidPost +
    breakdown.rejectedDuplicate +
    breakdown.rejectedMissingHandle +
    breakdown.rejectedMissingId +
    breakdown.processingError;
  return breakdown.apiPostCount === accounted;
}

export function sumOtherRejected(breakdown: PostProcessingBreakdown): number {
  return (
    breakdown.rejectedReply +
    breakdown.rejectedRepost +
    breakdown.rejectedInvalidPost +
    breakdown.rejectedDuplicate +
    breakdown.rejectedMissingHandle +
    breakdown.rejectedMissingId
  );
}
