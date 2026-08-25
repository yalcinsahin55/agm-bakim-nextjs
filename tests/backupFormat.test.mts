import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { cleanRestoredValue, getRestoreIdentity, sanitizeBackupValue } from "../lib/backupFormat.ts";

test("backup export removes secrets and normalizes non-JSON values", () => {
  const id = new ObjectId("507f1f77bcf86cd799439011");
  const sanitized = sanitizeBackupValue({
    _id: id,
    updated_at: new Date("2026-08-25T00:00:00.000Z"),
    password_hash: "hidden",
    pdf_b64: "hidden",
    nested: { token: "hidden", value: Number.NaN },
  });

  assert.deepEqual(sanitized, {
    _id: { $oid: id.toHexString() },
    updated_at: "2026-08-25T00:00:00.000Z",
    nested: { value: null },
  });
});

test("restore sanitizer blocks operators and converts valid ObjectId wrappers", () => {
  const restored = cleanRestoredValue({
    _id: { $oid: "507f1f77bcf86cd799439011" },
    name: "AGM-1",
    "$where": "malicious",
    "nested.path": "malicious",
    password: "hidden",
    nested: { "$gt": 1, safe: true },
  }) as Record<string, unknown>;

  assert.ok(restored._id instanceof ObjectId);
  assert.equal(restored.name, "AGM-1");
  assert.equal("$where" in restored, false);
  assert.equal("nested.path" in restored, false);
  assert.equal("password" in restored, false);
  assert.equal((restored.nested as Record<string, unknown>).safe, true);
  assert.equal(Object.keys(restored.nested as Record<string, unknown>).length, 1);
});

test("restore identity accepts safe string and ObjectId ids only", () => {
  assert.equal(getRestoreIdentity({ _id: "agm-1" }), "agm-1");
  assert.equal(getRestoreIdentity({ _id: new ObjectId("507f1f77bcf86cd799439011") }), "507f1f77bcf86cd799439011");
  assert.equal(getRestoreIdentity({ _id: "bad.id" }), null);
  assert.equal(getRestoreIdentity({ _id: { $oid: "not-an-object-id" } }), null);
});
