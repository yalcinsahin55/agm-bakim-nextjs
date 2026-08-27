import assert from "node:assert/strict";
import { test } from "node:test";

const { getCurrentRequestId, withApiTiming } = await import("../lib/performance.ts");

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
