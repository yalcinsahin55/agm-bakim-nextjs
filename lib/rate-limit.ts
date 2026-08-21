import type { NextRequest } from "next/server";

type RateEntry = { count: number; resetAt: number };
const store = new Map<string, RateEntry>();

export type RateResult =
  | { ok: true; remaining: number }
  | { ok: false; remaining: number; retryAfterMs: number };

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
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
    return { ok: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { ok: true, remaining: limit - entry.count };
}
