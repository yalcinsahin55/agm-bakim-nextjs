import assert from "node:assert/strict";
import { test } from "node:test";

const { getCurrentRequestId, withApiTiming, withDbTiming } = await import("../lib/performance.ts");

test("withApiTiming propagates a validated request id only within the handler", async () => {
  const request = new Request("https://example.test/api", {
    method: "GET",
    headers: { "X-Request-Id": "e2e-request-123" },
  });
  let insideRequestId: string | undefined;
  const response = await withApiTiming("GET /test", async () => {
    insideRequestId = getCurrentRequestId();
    return new Response(null, { status: 204 });
  }, { request });

  assert.equal(insideRequestId, "e2e-request-123");
  assert.equal(response.headers.get("X-Request-Id"), "e2e-request-123");
  assert.equal(getCurrentRequestId(), undefined);
});

test("withApiTiming creates a bounded request id when the incoming value is unsafe", async () => {
  const request = new Request("https://example.test/api", {
    method: "GET",
    headers: { "X-Request-Id": "bad value with spaces" },
  });
  const response = await withApiTiming("GET /test", async () => new Response(null, { status: 204 }), { request });
  const requestId = response.headers.get("X-Request-Id");
  assert.match(requestId || "", /^req_[0-9a-f-]{36}$/);
});
test("withDbTiming preserves the result and request context without logging query values", async () => {
  const request = new Request("https://example.test/api", {
    headers: { "X-Request-Id": "db-request-123" },
  });
  let insideRequestId: string | undefined;
  const response = await withApiTiming("GET /test", async () => {
    const result = await withDbTiming("assistant.summary.aggregate", async () => {
      insideRequestId = getCurrentRequestId();
      return { total: 1 };
    }, { thresholdMs: 0 });
    return Response.json(result);
  }, { request });
  assert.deepEqual(await response.json(), { total: 1 });
  assert.equal(insideRequestId, "db-request-123");
});

test("withDbTiming rethrows database errors with bounded operation names", async () => {
  await assert.rejects(
    withDbTiming("assistant/query with spaces", async () => {
      throw new Error("synthetic database failure");
    }),
    /synthetic database failure/,
  );
});
