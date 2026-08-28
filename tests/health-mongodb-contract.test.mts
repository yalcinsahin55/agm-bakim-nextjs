import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const proxyPath = new URL("../proxy.ts", import.meta.url);
const routePath = new URL("../app/api/health/mongodb/route.ts", import.meta.url);

test("Mongo health endpoint bypasses session middleware and keeps route-level secret auth", async () => {
  const [proxy, route] = await Promise.all([
    readFile(proxyPath, "utf8"),
    readFile(routePath, "utf8"),
  ]);
  assert.match(proxy, /"\/api\/health\/mongodb"/);
  assert.match(route, /authorization/);
  assert.match(route, /Bearer /);
  assert.match(route, /\{ ok: false, error: "unauthorized" \}/);
});
