#!/usr/bin/env node

/**
 * GET-only staging smoke/load check.
 *
 * Usage:
 *   BASE_URL=https://your-staging-url.example node scripts/staging-load-smoke.mts
 *   BASE_URL=https://your-staging-url.example AUTH_COOKIE='agm_session=...' CONCURRENCY=4 ROUNDS=3 node scripts/staging-load-smoke.mts
 *
 * This script never sends POST/PATCH/DELETE requests and refuses the public
 * production host unless ALLOW_PRODUCTION_SMOKE=1 is explicitly set.
 */
type SmokeTarget = { path: string; kind: "page" | "api" };
type SmokeResult = SmokeTarget & { status: number; ms: number };
type RoundResult = SmokeResult & { round: number };

const baseUrl = process.env.BASE_URL;
const concurrency = Math.max(1, Math.min(Number(process.env.CONCURRENCY || 3), 10));
const rounds = Math.max(1, Math.min(Number(process.env.ROUNDS || 2), 20));
const authCookie = process.env.AUTH_COOKIE || "";

if (!baseUrl) {
  console.error("BASE_URL gerekli. Örnek: BASE_URL=https://staging.example node scripts/staging-load-smoke.mts");
  process.exit(2);
}

const base = new URL(baseUrl);
if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
  console.error("BASE_URL HTTPS olmalı; yalnızca localhost için HTTP kabul edilir.");
  process.exit(2);
}
if (base.hostname === "agm-bakim-nextjs.vercel.app" && process.env.ALLOW_PRODUCTION_SMOKE !== "1") {
  console.error("Production host koruma nedeniyle reddedildi. Yalnızca GET smoke için ALLOW_PRODUCTION_SMOKE=1 ekleyin.");
  process.exit(2);
}

const targets: SmokeTarget[] = [
  { path: "/", kind: "page" },
  { path: "/dashboard", kind: "page" },
  { path: "/motorlar", kind: "page" },
  { path: "/kayitlar", kind: "page" },
  { path: "/istatistik", kind: "page" },
  { path: "/asistan", kind: "page" },
  { path: "/teknisyen-yetkilendirme", kind: "page" },
  { path: "/api/auth/me", kind: "api" },
  { path: "/api/engines", kind: "api" },
  { path: "/api/maintenance-types/panel", kind: "api" },
  { path: "/api/records?page=1&page_size=25", kind: "api" },
  { path: "/api/analytics/summary", kind: "api" },
  { path: "/api/notifications", kind: "api" },
];

function expectedStatus(target: SmokeTarget, status: number, hasAuth: boolean): boolean {
  if (target.kind === "api") return hasAuth ? status >= 200 && status < 500 : status === 401;
  return hasAuth ? status >= 200 && status < 400 : status === 307 || status === 302;
}

async function request(target: SmokeTarget): Promise<SmokeResult> {
  const started = performance.now();
  const response = await fetch(new URL(target.path, base), {
    method: "GET",
    redirect: "manual",
    headers: authCookie ? { cookie: authCookie } : undefined,
  });
  return {
    ...target,
    status: response.status,
    ms: performance.now() - started,
  };
}

const hasAuth = Boolean(authCookie);
const allResults: RoundResult[] = [];
for (let round = 1; round <= rounds; round += 1) {
  for (let offset = 0; offset < targets.length; offset += concurrency) {
    const batch = targets.slice(offset, offset + concurrency);
    const results = await Promise.all(batch.map((target) => request(target)));
    allResults.push(...results.map((result) => ({ ...result, round })));
  }
}

const latencies = allResults.map((result) => result.ms).sort((a, b) => a - b);
const percentile = (p: number): number => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] || 0;
const failures = allResults.filter((result) => !expectedStatus(result, result.status, hasAuth));
const grouped = new Map();
for (const result of allResults) {
  const key = `${result.path} ${result.status}`;
  grouped.set(key, (grouped.get(key) || 0) + 1);
}

console.log(`GET-only smoke/load: ${base.origin}`);
console.log(`auth=${hasAuth ? "provided" : "none"} rounds=${rounds} concurrency=${concurrency} requests=${allResults.length}`);
console.log(`latency_ms p50=${percentile(0.50).toFixed(1)} p95=${percentile(0.95).toFixed(1)} max=${Math.max(...latencies).toFixed(1)}`);
console.log("status summary:");
for (const [key, count] of grouped) console.log(`  ${count}x ${key}`);

if (failures.length > 0) {
  console.error("Beklenmeyen yanıtlar:");
  for (const failure of failures) console.error(`  ${failure.path}: ${failure.status} (${failure.ms.toFixed(1)}ms)`);
  process.exit(1);
}

console.log("Sonuç: tüm GET-only kontroller beklenen yanıtları verdi.");
