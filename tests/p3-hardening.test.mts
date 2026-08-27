import assert from "node:assert/strict";
import test from "node:test";
import { isMongoDuplicateKeyError } from "../lib/mongoSecurity.ts";
import { isSeedEndpointEnabled } from "../lib/seedPolicy.ts";

test("seed endpoint policy is closed only for production-like environments without explicit opt-in", () => {
  assert.equal(isSeedEndpointEnabled({ NODE_ENV: "production", VERCEL_ENV: "production" }), false);
  assert.equal(isSeedEndpointEnabled({ NODE_ENV: "production", VERCEL_ENV: "production", SEED_ENDPOINT_ENABLED: "true" }), true);
  assert.equal(isSeedEndpointEnabled({ NODE_ENV: "production", VERCEL_ENV: "preview" }), true);
  assert.equal(isSeedEndpointEnabled({ NODE_ENV: "development", VERCEL_ENV: "development" }), true);
});

test("duplicate-key detector accepts Mongo error-shaped values without requiring a Mongo instance", () => {
  assert.equal(isMongoDuplicateKeyError({ code: 11000 }), true);
  assert.equal(isMongoDuplicateKeyError({ code: 11001 }), false);
  assert.equal(isMongoDuplicateKeyError(new Error("duplicate")), false);
  assert.equal(isMongoDuplicateKeyError(null), false);
});
