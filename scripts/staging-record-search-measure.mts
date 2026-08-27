#!/usr/bin/env node
/**
 * Authenticated GET-only staging benchmark for the records list endpoint.
 *
 * Usage:
 *   BASE_URL=https://preview.example AUTH_COOKIE='agm_session=...' \
 *   RECORD_SEARCH_TERMS='motor adı,teknisyen adı' ROUNDS=20 CONCURRENCY=1 \
 *   npm run perf:staging-records
 *
 * This script refuses the canonical production host and never sends a
 * mutating request. AUTH_COOKIE is read from the environment and is never
 * printed or written to the output.
 */
import { writeFile } from "node:fs/promises";

type MeasurementCase = {
  name: string;
  hasSearch: boolean;
  search?: string;
};

type Sample = {
  caseName: string;
  round: number;
  status: number | "ERR";
  ms: number;
  serverTimingMs?: number;
  responseBytes?: number;
  error?: string;
};

type CaseSummary = {
  caseName: string;
  hasSearch: boolean;
  sampleCount: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  serverTimingP50Ms: number | null;
  serverTimingP95Ms: number | null;
  statusCounts: Record<string, number>;
  errors: string[];
};

const canonicalProductionHost = "agm-bakim-nextjs.vercel.app";
const baseUrl = process.env.BASE_URL;
const authCookie = process.env.AUTH_COOKIE || "";
const timeoutMs = boundedInteger(process.env.TIMEOUT_MS, 15_000, 2_000, 60_000);
const rounds = boundedInteger(process.env.ROUNDS, 20, 5, 40);
const concurrency = boundedInteger(process.env.CONCURRENCY, 1, 1, 4);
const searchTerms = (process.env.RECORD_SEARCH_TERMS || "")
  .split(",")
  .map((term) => term.trim())
  .filter(Boolean)
  .slice(0, 4);
const outputPath = process.env.PERF_OUTPUT?.trim();

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

if (!baseUrl) fail("BASE_URL gerekli; yalnızca staging veya preview origin verin.");
if (!authCookie) fail("AUTH_COOKIE gerekli; ölçüm authenticated kayıt endpointi içindir.");
if (authCookie.length > 8192) fail("AUTH_COOKIE beklenenden uzun.");

let base: URL;
try {
  base = new URL(baseUrl);
} catch {
  fail("BASE_URL geçerli bir URL olmalı.");
}
if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
  fail("BASE_URL HTTPS olmalı; yalnızca localhost için HTTP kabul edilir.");
}
if (base.hostname === canonicalProductionHost) {
  fail("Canonical production hostunda performans/load ölçümü çalıştırılmaz; staging veya preview origin kullanın.");
}
const isLocalHost = base.hostname === "localhost" || base.hostname === "127.0.0.1";
const isProjectVercelHost = /^agm-bakim-nextjs(?:-|\.)[a-z0-9-]+\.vercel\.app$/i.test(base.hostname);
if (!isLocalHost && !isProjectVercelHost && process.env.ALLOW_CUSTOM_PERF_HOST !== "1") {
  fail("Custom staging hostu için ALLOW_CUSTOM_PERF_HOST=1 açıkça belirtilmeli.");
}

const cases: MeasurementCase[] = [
  { name: "baseline", hasSearch: false },
  ...searchTerms.map((_, index) => ({ name: `search#${index + 1}`, hasSearch: true, search: searchTerms[index] })),
];
const plannedRequests = cases.length * rounds;
if (plannedRequests > 200) {
  fail("Planlanan GET sayısı güvenli rate-limit payını aşıyor; ROUNDS veya arama terimi sayısını azaltın.");
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[rank];
}

function parseServerTiming(header: string | null): number | undefined {
  const match = header?.match(/(?:^|;)\s*app\s*;\s*dur=([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function requestCase(measurementCase: MeasurementCase, round: number): Promise<Sample> {
  const url = new URL("/api/records", base);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "25");
  if (measurementCase.search) url.searchParams.set("search", measurementCase.search);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { cookie: authCookie, accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
    const body = await response.arrayBuffer();
    return {
      caseName: measurementCase.name,
      round,
      status: response.status,
      ms: performance.now() - started,
      serverTimingMs: parseServerTiming(response.headers.get("server-timing")),
      responseBytes: body.byteLength,
    };
  } catch (error) {
    return {
      caseName: measurementCase.name,
      round,
      status: "ERR",
      ms: performance.now() - started,
      error: error instanceof Error ? error.name : "UnknownError",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function measureCase(measurementCase: MeasurementCase): Promise<Sample[]> {
  // One warm-up request per case is intentionally excluded from the sample.
  await requestCase(measurementCase, 0);
  const samples: Sample[] = [];
  for (let round = 1; round <= rounds; round += concurrency) {
    const batch = Array.from(
      { length: Math.min(concurrency, rounds - round + 1) },
      (_, offset) => requestCase(measurementCase, round + offset),
    );
    samples.push(...(await Promise.all(batch)));
  }
  return samples;
}

function summarize(measurementCase: MeasurementCase, samples: Sample[]): CaseSummary {
  const latencies = samples.map((sample) => sample.ms);
  const serverTimings = samples.flatMap((sample) => sample.serverTimingMs === undefined ? [] : [sample.serverTimingMs]);
  const statusCounts: Record<string, number> = {};
  for (const sample of samples) statusCounts[String(sample.status)] = (statusCounts[String(sample.status)] || 0) + 1;
  return {
    caseName: measurementCase.name,
    hasSearch: measurementCase.hasSearch,
    sampleCount: samples.length,
    p50Ms: percentile(latencies, 0.5) || 0,
    p95Ms: percentile(latencies, 0.95) || 0,
    maxMs: Math.max(...latencies, 0),
    serverTimingP50Ms: percentile(serverTimings, 0.5),
    serverTimingP95Ms: percentile(serverTimings, 0.95),
    statusCounts,
    errors: [...new Set(samples.flatMap((sample) => sample.error ? [sample.error] : []))],
  };
}

const allSamples: Sample[] = [];
for (const measurementCase of cases) allSamples.push(...(await measureCase(measurementCase)));
const summaries = cases.map((measurementCase) => summarize(measurementCase, allSamples.filter((sample) => sample.caseName === measurementCase.name)));
const failed = allSamples.filter((sample) => sample.status !== 200);
const result = {
  capturedAt: new Date().toISOString(),
  origin: base.origin,
  endpoint: "/api/records?page=1&page_size=25",
  method: "GET",
  rounds,
  concurrency,
  warmupPerCase: 1,
  plannedRequests,
  summaries,
  failedRequests: failed.length,
};

console.log(`Staging records benchmark: ${base.origin}`);
console.log(`GET-only authenticated cases=${cases.length} rounds=${rounds} concurrency=${concurrency} samples=${allSamples.length}`);
for (const summary of summaries) {
  const timing = summary.serverTimingP50Ms === null ? "n/a" : `p50=${summary.serverTimingP50Ms.toFixed(1)} p95=${summary.serverTimingP95Ms?.toFixed(1)}`;
  console.log(`${summary.caseName}: client_ms p50=${summary.p50Ms.toFixed(1)} p95=${summary.p95Ms.toFixed(1)} max=${summary.maxMs.toFixed(1)}; server_timing_ms ${timing}; statuses=${JSON.stringify(summary.statusCounts)}`);
}
if (outputPath) {
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`JSON çıktı: ${outputPath}`);
}
if (failed.length > 0) {
  console.error(`Beklenmeyen GET sonucu sayısı: ${failed.length}; örnek status=${String(failed[0].status)}.`);
  process.exitCode = 1;
} else {
  console.log("Sonuç: tüm authenticated GET kontrolleri 200 döndü.");
}
