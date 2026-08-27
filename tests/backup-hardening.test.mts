import assert from "node:assert/strict";
import test from "node:test";
import { buildRestorePlan, RestorePlanError } from "../lib/backupRestore.ts";
import { computeBackupChecksum, validateBackupIntegrity } from "../lib/backupFormat.ts";

const collections = {
  engines: [{ _id: "engine-1", name: "AGM-1", "$where": "blocked" }],
  maintenance_types: [],
  maintenance_records: [],
  oil_analyses: [],
};

test("production restore requires integrity while non-production may omit it", () => {
  assert.deepEqual(validateBackupIntegrity(collections, undefined, true), {
    ok: false,
    error: "Production geri yüklemesi için yedek checksum bilgisi zorunludur.",
  });
  assert.deepEqual(validateBackupIntegrity(collections, undefined, false), { ok: true });
});

test("restore integrity accepts the export checksum and rejects tampering", () => {
  const integrity = { algorithm: "sha256", value: computeBackupChecksum(collections) };
  assert.deepEqual(validateBackupIntegrity(collections, integrity, true), { ok: true });
  assert.deepEqual(validateBackupIntegrity({ ...collections, engines: [{ _id: "engine-2" }] }, integrity, true), {
    ok: false,
    error: "Yedek checksum doğrulaması başarısız.",
  });
  assert.equal(validateBackupIntegrity(collections, { algorithm: "md5", value: "a" }, true).ok, false);
});

test("restore plan sanitizes all supported collections before any write", () => {
  const plan = buildRestorePlan(collections);
  assert.deepEqual(plan.summary, { engines: 1, maintenance_types: 0, maintenance_records: 0, oil_analyses: 0 });
  assert.deepEqual(plan.skipped, { engines: 0, maintenance_types: 0, maintenance_records: 0, oil_analyses: 0 });
  const operations = plan.operationsByCollection.get("engines") || [];
  assert.equal(operations.length, 1);
  const operation = operations[0];
  assert.ok(operation && "updateOne" in operation);
  if (operation && "updateOne" in operation) {
    assert.equal(operation.updateOne.filter?._id, "engine-1");
    const update = operation.updateOne.update as { $set?: Record<string, unknown> };
    assert.equal(update.$set?.name, "AGM-1");
    assert.equal("$where" in (update.$set || {}), false);
  }
});

test("restore plan rejects oversized collection before mutation", () => {
  assert.throws(
    () => buildRestorePlan({ engines: Array.from({ length: 50_001 }, () => ({ _id: "engine-1" })) }),
    (error: unknown) => error instanceof RestorePlanError && error.status === 413,
  );
});
