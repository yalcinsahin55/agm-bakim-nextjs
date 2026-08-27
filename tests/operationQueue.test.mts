import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationQueue, filterOperationItems } from "../app/dashboard/_lib/operationQueue.ts";
import type { PanelItem } from "../lib/status.ts";

function item(overrides: Partial<PanelItem>): PanelItem {
  return {
    engine_id: "engine-1",
    engine_name: "AGM-1",
    type_key: "daily",
    type_label: "Günlük bakım",
    engine_hours: 1000,
    last_hour: 900,
    period: 250,
    remaining: 150,
    status: "yaklasiyor",
    ...overrides,
  };
}

test("operation queue prioritizes overdue, critical, and nearest remaining work", () => {
  const queue = buildOperationQueue([
    item({ engine_id: "normal", engine_name: "AGM-9", type_key: "normal", remaining: 500, status: "normal" }),
    item({ engine_id: "critical-late", engine_name: "AGM-2", type_key: "critical-late", remaining: 90, status: "kritik" }),
    item({ engine_id: "overdue-low", engine_name: "AGM-4", type_key: "overdue-low", remaining: -4, status: "gecikmis" }),
    item({ engine_id: "overdue-high", engine_name: "AGM-3", type_key: "overdue-high", remaining: -80, status: "gecikmis" }),
    item({ engine_id: "critical-near", engine_name: "AGM-1", type_key: "critical-near", remaining: 20, status: "kritik" }),
  ]);

  assert.deepEqual(queue.map((entry) => entry.engine_id), [
    "overdue-high",
    "overdue-low",
    "critical-near",
    "critical-late",
    "normal",
  ]);
});

test("operation queue applies a safe non-negative limit and status filter", () => {
  const items = [
    item({ engine_id: "late", status: "gecikmis", remaining: -10 }),
    item({ engine_id: "soon", status: "yaklasiyor", remaining: 200 }),
  ];

  assert.deepEqual(filterOperationItems(items, "gecikmis").map((entry) => entry.engine_id), ["late"]);
  assert.deepEqual(buildOperationQueue(items, -2), []);
  assert.deepEqual(buildOperationQueue(items, Number.NaN).map((entry) => entry.engine_id), ["late", "soon"]);
});
