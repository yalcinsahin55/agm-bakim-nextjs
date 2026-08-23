import { isIP } from "node:net";
import type { NextRequest } from "next/server";

interface RateEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateEntry>();

// retryAfterMs her zaman vardır (ok=true iken 0) — TS daraltma derdi olmaz
export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const candidates = forwarded.split(",").map((value) => value.trim()).filter(Boolean);
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      if (candidate && isIP(candidate)) return candidate;
    }
  }
  return "unknown";
}

/** Basit bellek-içi rate limiter.
 *  Not: Serverless ortamda her instance kendi belleğini tutar;
 *  küçük ölçekli uygulamalar için yeterli bir caydırıcılıktır. */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();

  // Süresi dolmuş kayıtları temizle (bellek şişmesin)
  if (store.size > 1000) {
    for (const [k, v] of store) if (now > v.resetAt) store.delete(k);
  }

  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (entry.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { ok: true, remaining: limit - entry.count, retryAfterMs: 0 };
}

export interface BatchRateRequest {
  key: string;
  limit: number;
  windowMs: number;
}

/**
 * Local fallback için birden fazla boyutu aynı instance içinde birlikte kontrol eder.
 * Redis production modunda bu işlem Lua script’iyle gerçek anlamda atomiktir.
 */
export function checkRateLimitBatch(requests: BatchRateRequest[]): RateResult {
  const now = Date.now();
  const entries = requests.map((request) => ({ request, entry: store.get(request.key) }));
  const blocked = entries.find(({ request, entry }) => entry && now <= entry.resetAt && entry.count >= request.limit);
  if (blocked) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(1, (blocked.entry as RateEntry).resetAt - now),
    };
  }

  let remaining = Number.MAX_SAFE_INTEGER;
  let retryAfterMs = 0;
  for (const { request, entry } of entries) {
    if (!entry || now > entry.resetAt) {
      store.set(request.key, { count: 1, resetAt: now + request.windowMs });
      remaining = Math.min(remaining, request.limit - 1);
      continue;
    }
    entry.count += 1;
    remaining = Math.min(remaining, request.limit - entry.count);
    retryAfterMs = Math.max(retryAfterMs, entry.resetAt - now);
  }
  return { ok: true, remaining: Math.max(0, remaining), retryAfterMs: 0 };
}
