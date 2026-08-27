import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("login rotates rate-limit buckets without weakening limits", () => {
  const login = source("app/api/auth/login/route.ts");
  const apiRateLimit = source("lib/apiRateLimit.ts");

  assert.match(login, /scope: "login-identifier-v2", limit: 8, windowMs: 10 \* 60 \* 1000/);
  assert.match(login, /scope: "login-ip-v2", limit: 5, windowMs: 10 \* 60 \* 1000/);
  assert.match(login, /clientIp !== "unknown"/);
  assert.doesNotMatch(login, /scope: "login-ip",/);
  assert.doesNotMatch(login, /scope: "login-identifier",/);
  assert.match(apiRateLimit, /"login-ip-v2"/);
  assert.match(apiRateLimit, /"login-identifier-v2"/);
});

test("login UI honors Retry-After and prevents immediate repeated submissions", () => {
  const loginPage = source("app/login/page.tsx");
  assert.match(loginPage, /response\.status === 429/);
  assert.match(loginPage, /response\.headers\.get\("Retry-After"\)/);
  assert.match(loginPage, /setRetryUntil\(Date\.now\(\) \+ retryAfter \* 1000\)/);
  assert.match(loginPage, /disabled=\{loading \|\| retryAfterSeconds > 0\}/);
  assert.match(loginPage, /Tekrar deneyin/);
});

test("login keeps identifier normalization before rate-limit identity selection", () => {
  const login = source("app/api/auth/login/route.ts");
  assert.match(login, /isValidPhone\(identifier\) \? normalizePhone\(identifier\) : identifier\.toLowerCase\(\)\.trim\(\)/);
  assert.match(login, /enforceCompositeRateLimit\(req, rateLimitRequests\)/);
});
