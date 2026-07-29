export type SourceType =
  | "GOVERNMENT"
  | "PREFECTURE"
  | "MUNICIPALITY"
  | "LOCAL_GOVERNMENT"
  | "DEFENSE"
  | "PUBLIC_OFFICIAL";

export type SourcePriority = "HIGH" | "NORMAL";

export type VerificationStatus = "VERIFIED" | "VERIFYING" | "DISABLED";

export type Source = {
  sourceId: string;
  displayName: string;
  accountHandle: string | null;
  xUserId?: string | null;
  sourceType: SourceType;
  region: string;
  priority: SourcePriority;
  verificationStatus: VerificationStatus;
  fetchEnabled: boolean;
  contentFilter: string;
};

export const BOUSAI_KUMAMOTO_HANDLE = "Bousai_Kumamoto";

export function isPubliclyListedSource(source: Source): boolean {
  return source.verificationStatus === "VERIFIED" && source.fetchEnabled;
}
