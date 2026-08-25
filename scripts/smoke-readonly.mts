#!/usr/bin/env node
type SmokeCheck = { name: string; path: string; expected: readonly number[] };
type SmokeResult = SmokeCheck & { status: number | "ERR"; duration: number; ok: boolean; error?: string };

const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const cookie = process.env.SMOKE_COOKIE || "";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15_000);

const checks: SmokeCheck[] = [
  { name: "dashboard page", path: "/dashboard", expected: [200, 307, 308] },
  { name: "records page", path: "/kayitlar", expected: [200, 307, 308] },
  { name: "oil analyses page", path: "/yag-analizleri", expected: [200, 307, 308] },
  { name: "engines API", path: "/api/engines", expected: [200, 401] },
  { name: "maintenance panel API", path: "/api/maintenance-types/panel", expected: [200, 401] },
  { name: "unread count API", path: "/api/notifications/unread-count", expected: [200, 401] },
  { name: "notifications API", path: "/api/notifications?limit=1", expected: [200, 401] },
];

function formatDuration(ms: number) {
  return `${ms.toFixed(0)} ms`;
}

async function checkEndpoint(check: SmokeCheck): Promise<SmokeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${check.path}`, {
      method: "GET",
      headers: cookie ? { cookie } : undefined,
      redirect: "manual",
      signal: controller.signal,
    });
    const duration = performance.now() - started;
    const ok = check.expected.includes(response.status);
    return { ...check, status: response.status, duration, ok };
  } catch (error) {
    const duration = performance.now() - started;
    return { ...check, status: "ERR", duration, ok: false, error: error instanceof Error ? error.name : "UnknownError" };
  } finally {
    clearTimeout(timer);
  }
}

const results: SmokeResult[] = [];
for (const check of checks) results.push(await checkEndpoint(check));

console.log(`Read-only smoke: ${baseUrl}`);
for (const result of results) {
  const expected = result.expected.join("/");
  const suffix = result.error ? ` ${result.error}` : "";
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}: ${result.status} (${formatDuration(result.duration)}; expected ${expected})${suffix}`);
}

const failed = results.filter((result) => !result.ok);
console.log(`Summary: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exitCode = 1;
