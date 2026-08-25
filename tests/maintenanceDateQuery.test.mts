import assert from "node:assert/strict";
import test from "node:test";
import { maintenanceDateCandidateMatch } from "../lib/maintenanceDateQuery.ts";

test("maintenance date candidate match is null without a date range", () => {
  assert.equal(maintenanceDateCandidateMatch(), null);
});

test("maintenance date candidate match preserves legacy date representations", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");
  const to = new Date("2026-12-31T23:59:59.999Z");
  const query = maintenanceDateCandidateMatch(from, to);
  assert.ok(query && "$or" in query && Array.isArray(query.$or));
  assert.equal(query.$or.length, 4);
  assert.deepEqual(query.$or[1], { maintenance_start_at: { $type: "string" } });
  assert.deepEqual(query.$or[2], { maintenance_start_at: { $type: "number" } });
  assert.deepEqual(query.$or[3], {
    $and: [
      { $or: [{ maintenance_start_at: { $exists: false } }, { maintenance_start_at: null }] },
      { created_at: { $gte: from, $lte: to } },
    ],
  });
});

test("maintenance date candidate match supports open-ended ranges", () => {
  const query = maintenanceDateCandidateMatch(new Date("2026-01-01T00:00:00.000Z"));
  assert.ok(query && "$or" in query && Array.isArray(query.$or));
  assert.deepEqual(query.$or[0], { maintenance_start_at: { $gte: new Date("2026-01-01T00:00:00.000Z") } });
});
