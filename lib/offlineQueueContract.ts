export const OFFLINE_OWNER_HEADER = "x-agm-offline-owner";

export function hasOfflineOwnerMismatch(
  claimedOwnerId: string | null,
  currentUserId: string,
): boolean {
  if (claimedOwnerId === null) return false;
  const normalizedClaim = claimedOwnerId.trim();
  return normalizedClaim.length === 0 || normalizedClaim !== currentUserId;
}
