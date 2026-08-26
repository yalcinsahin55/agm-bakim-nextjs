import assert from "node:assert/strict";
import { test } from "node:test";

process.env.JWT_SECRET ||= "local-session-test-secret-0123456789";

const { createSessionToken, verifySessionToken, verifySessionTokenDetails } = await import("../lib/auth.ts");

test("session token carries a validated version without changing user identity", async () => {
  const token = await createSessionToken("user-123", 7);
  assert.deepEqual(await verifySessionTokenDetails(token), { userId: "user-123", sessionVersion: 7 });
  assert.equal(await verifySessionToken(token), "user-123");
});

test("session token defaults to version zero for legacy-compatible issuance", async () => {
  const token = await createSessionToken("legacy-user");
  assert.deepEqual(await verifySessionTokenDetails(token), { userId: "legacy-user", sessionVersion: 0 });
});
