import assert from "node:assert/strict";
import test from "node:test";
import { isMongoDuplicateKeyError } from "../lib/mongoSecurity.ts";

test("Mongo duplicate-key helper recognizes direct and BulkWrite writeErrors", () => {
  assert.equal(isMongoDuplicateKeyError({ code: 11000 }), true);
  assert.equal(isMongoDuplicateKeyError({ writeErrors: [{ code: 11000, errmsg: "duplicate key" }] }), true);
  assert.equal(isMongoDuplicateKeyError({ writeErrors: [{ code: 121 }] }), false);
  assert.equal(isMongoDuplicateKeyError({ code: 50 }), false);
});

test("Mongo duplicate-key helper ignores malformed nested values", () => {
  assert.equal(isMongoDuplicateKeyError({ writeErrors: [{ code: "11000" }] }), false);
  assert.equal(isMongoDuplicateKeyError({ writeErrors: "not-an-array" }), false);
  assert.equal(isMongoDuplicateKeyError(null), false);
});
