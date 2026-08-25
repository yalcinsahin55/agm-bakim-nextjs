import assert from "node:assert/strict";
import test from "node:test";
import { buildItems, remainingHours, statusFor } from "../lib/status.ts";

test("status thresholds remain explicit and ordered", () => {
  assert.equal(remainingHours(18_450, 17_000, 2_000), 550);
  assert.equal(statusFor(0), "gecikmis");
  assert.equal(statusFor(100), "kritik");
  assert.equal(statusFor(250), "yaklasiyor");
  assert.equal(statusFor(251), "normal");
});

test("buildItems calculates scoped maintenance status and remaining hours", () => {
  const items = buildItems(
    [
      { _id: "agm-7", name: "AGM-7", hours: 18_450, load_kw: 0, updated_at: new Date("2026-01-01T00:00:00.000Z"), history: [] },
      { _id: "agm-8", name: "AGM-8", hours: 1_000, load_kw: 0, updated_at: new Date("2026-01-01T00:00:00.000Z"), history: [] },
    ],
    [
      {
        _id: "siloksan",
        key: "siloksan",
        label: "Siloksan",
        default_period_hours: 2_000,
        engine_scope: "explicit",
        engine_states: {
          AGM007: { last_maintenance_hour: 17_000, period_hours: 2_000 },
          "agm-8": { last_maintenance_hour: 0, period_hours: 0 },
        },
      },
    ],
  );

  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    engine_id: "agm-7",
    engine_name: "AGM-7",
    type_key: "siloksan",
    type_label: "Siloksan",
    engine_hours: 18_450,
    last_hour: 17_000,
    period: 2_000,
    remaining: 550,
    status: "normal",
  });
});

test("buildItems omits disabled maintenance periods", () => {
  const items = buildItems(
    [{ _id: "agm-1", name: "AGM-1", hours: 100, load_kw: 0, updated_at: new Date("2026-01-01T00:00:00.000Z"), history: [] }],
    [{ _id: "disabled", key: "disabled", label: "Devre dışı", default_period_hours: 0, engine_states: {} }],
  );
  assert.equal(items.length, 0);
});
