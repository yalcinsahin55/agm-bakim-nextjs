const CACHE_TTL_MS = 5_000;
const MAX_CACHE_ENTRIES = 512;

type CacheEntry = {
  unreadCount: number;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

export function getCachedUnreadCount(userId: string, fresh = false): number | null {
  if (fresh) return null;
  const entry = cache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(userId);
    return null;
  }
  return entry.unreadCount;
}

export function setCachedUnreadCount(userId: string, unreadCount: number): void {
  if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(userId)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.delete(userId);
  cache.set(userId, {
    unreadCount: Math.max(0, Math.floor(unreadCount)),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export const notificationUnreadCacheConfig = {
  ttlMs: CACHE_TTL_MS,
  maxEntries: MAX_CACHE_ENTRIES,
} as const;

export function clearUnreadCountCache(): void {
  cache.clear();
}
