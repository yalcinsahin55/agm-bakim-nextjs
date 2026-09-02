import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string): Promise<string> => readFile(path.join(root, relativePath), "utf8");

// ─── Auth guards: tüm korumalı endpoint'ler getCurrentUser çağırmalı ───

test("engines endpoint requires authentication on both GET and POST", async () => {
  const route = await source("app/api/engines/route.ts");
  assert.match(route, /getCurrentUser\(/, "GET /api/engines must authenticate");
  assert.match(route, /Giriş gerekli/, "must return 401 for unauthenticated requests");
});

test("maintenance-types endpoint requires authentication", async () => {
  const route = await source("app/api/maintenance-types/route.ts");
  assert.match(route, /getCurrentUser\(/, "maintenance-types must authenticate");
});

test("users endpoint requires admin role for POST", async () => {
  const route = await source("app/api/users/route.ts");
  assert.match(route, /getCurrentUser\(/, "users endpoint must authenticate");
  assert.match(route, /canManageUsers\(/, "users POST must check admin role");
});

test("oil-analyses endpoint requires authentication", async () => {
  const route = await source("app/api/oil-analyses/route.ts");
  assert.match(route, /getCurrentUser\(/, "oil-analyses must authenticate");
});

test("pressure-readings endpoint requires authentication", async () => {
  const route = await source("app/api/pressure-readings/route.ts");
  assert.match(route, /getCurrentUser\(/, "pressure-readings must authenticate");
});

test("equipment-info endpoint requires authentication", async () => {
  const route = await source("app/api/equipment-info/route.ts");
  assert.match(route, /getCurrentUser\(/, "equipment-info must authenticate");
});

test("notifications endpoint requires authentication", async () => {
  const route = await source("app/api/notifications/route.ts");
  assert.match(route, /getCurrentUser\(/, "notifications must authenticate");
});

test("records single read endpoint requires authentication and rate limit", async () => {
  const route = await source("app/api/records/[id]/_lib/recordRead.ts");
  assert.match(route, /getCurrentUser\(/, "record read must authenticate");
  assert.match(route, /enforceApiRateLimit\(/, "record read must have rate limit");
  assert.match(route, /records-read-single/, "record read must use correct rate limit scope");
});

// ─── Rate limit guards: yazma endpoint'lerinde rate limit olmalı ───

test("engines POST has rate limit", async () => {
  const route = await source("app/api/engines/route.ts");
  assert.match(route, /enforceApiRateLimit\(/, "engines POST must have rate limit");
});

test("maintenance-types POST has rate limit", async () => {
  const route = await source("app/api/maintenance-types/route.ts");
  assert.match(route, /enforceApiRateLimit\(/, "maintenance-types POST must have rate limit");
});

test("users POST has rate limit", async () => {
  const route = await source("app/api/users/route.ts");
  assert.match(route, /enforceApiRateLimit\(/, "users POST must have rate limit");
});

test("oil-analyses POST has rate limit", async () => {
  const route = await source("app/api/oil-analyses/route.ts");
  assert.match(route, /enforceApiRateLimit\(/, "oil-analyses POST must have rate limit");
});

test("equipment-info POST has rate limit", async () => {
  const route = await source("app/api/equipment-info/route.ts");
  assert.match(route, /enforceApiRateLimit\(/, "equipment-info POST must have rate limit");
});

// ─── Input validation: yazma endpoint'lerinde Zod veya boyut limiti ───

test("engines POST uses request body size limit", async () => {
  const route = await source("app/api/engines/route.ts");
  assert.match(route, /parseJsonBodyLimited\(|MAX_.*REQUEST_BYTES/, "engines POST must limit request body size");
});

test("users POST uses Zod validation", async () => {
  const route = await source("app/api/users/route.ts");
  assert.match(route, /adminUserSchema|safeParse\(/, "users POST must validate with Zod");
});

test("oil-analyses POST uses request body size limit", async () => {
  const route = await source("app/api/oil-analyses/route.ts");
  assert.match(route, /parseJsonBodyLimited\(|MAX_.*REQUEST_BYTES/, "oil-analyses POST must limit request body size");
});

// ─── Error handling: tüm API'ler try-catch ile 500 döndürmeli ───

test("engines GET has error handling", async () => {
  const route = await source("app/api/engines/route.ts");
  assert.match(route, /catch\s*\(/, "engines GET must have try-catch");
  assert.match(route, /status:\s*500/, "engines GET must return 500 on error");
});

test("maintenance-types GET has error handling", async () => {
  const route = await source("app/api/maintenance-types/route.ts");
  assert.match(route, /catch\s*\(/, "maintenance-types GET must have try-catch");
  assert.match(route, /status:\s*500/, "maintenance-types GET must return 500 on error");
});

// ─── AbortController: client sayfalarda fetch'ler abort edilebilmeli ───

test("useAbortableFetch hook exists and exports signal", async () => {
  const hook = await source("lib/useAbortableFetch.ts");
  assert.match(hook, /export function useAbortableFetch/, "hook must be exported");
  assert.match(hook, /AbortController/, "hook must use AbortController");
  assert.match(hook, /signal/, "hook must expose signal");
});

test("migrated data pages use usePageData with abortable loaders", async () => {
  const page = await source("app/motorlar/page.tsx");
  assert.match(page, /usePageData/, "motorlar page must use usePageData");
  assert.match(page, /fetch[\s\S]*signal/, "motorlar page must pass signal to fetch");
  for (const file of ["app/motor-bilgi/page.tsx", "app/karter-basinci/page.tsx"]) {
    const migratedPage = await source(file);
    assert.match(migratedPage, /usePageData/, `${file} must use usePageData`);
    assert.match(migratedPage, /fetch[\s\S]*signal/, `${file} must pass signal to fetch`);
  }
});

test("bildirimler page uses abortable fetch", async () => {
  const page = await source("app/bildirimler/page.tsx");
  assert.match(page, /useAbortableFetch/, "bildirimler page must use abortable fetch");
  assert.match(page, /signal/, "bildirimler page must pass signal to fetch");
});

test("yag-analizleri page uses abortable fetch", async () => {
  const page = await source("app/yag-analizleri/page.tsx");
  assert.match(page, /useAbortableFetch/, "yag-analizleri page must use abortable fetch");
  assert.match(page, /signal/, "yag-analizleri page must pass signal to fetch");
});
