import assert from "node:assert/strict";
import test from "node:test";
import { durationMinutes, maintenanceTypeDurationSummaries, uniqueMaintenanceEvents } from "../lib/maintenanceTrend.ts";
import type { MaintenanceTrendRecord } from "../lib/maintenanceTrend.ts";

function record(input: Partial<MaintenanceTrendRecord> & Pick<MaintenanceTrendRecord, "_id" | "type_key" | "type_label">): MaintenanceTrendRecord {
  return {
    maintenance_duration_minutes: 480,
    technician_contributions: [{ contribution_role: "responsible", duration_minutes: 480 }],
    ...input,
  };
}

test("trend duration prefers responsible technician time to elapsed maintenance interval", () => {
  const value = record({
    _id: "single",
    type_key: "oil",
    type_label: "Yağ Değişimi",
    maintenance_start_at: "2026-09-01T08:00:00.000Z",
    maintenance_end_at: "2026-09-01T17:00:00.000Z",
    maintenance_duration_minutes: 540,
    technician_contributions: [{ contribution_role: "responsible", duration_minutes: 150 }],
  });
  assert.equal(durationMinutes(value), 150);
});

test("combined maintenance keeps all responsible time on its main type and estimates extra types from history", () => {
  const records: MaintenanceTrendRecord[] = [
    record({ _id: "oil-single", group_id: "oil-single", grouped_with: null, type_key: "oil", type_label: "Yağ Değişimi", maintenance_duration_minutes: 120, technician_contributions: [{ contribution_role: "responsible", duration_minutes: 120 }] }),
    record({ _id: "cooler-single", group_id: "cooler-single", grouped_with: null, type_key: "cooler", type_label: "Intercooler Bakımı", maintenance_duration_minutes: 180, technician_contributions: [{ contribution_role: "responsible", duration_minutes: 180 }] }),
    record({ _id: "combo-oil", group_id: "combo", grouped_with: null, type_key: "oil", type_label: "Yağ Değişimi", maintenance_duration_minutes: 300, technician_contributions: [{ contribution_role: "responsible", duration_minutes: 300 }] }),
    record({ _id: "combo-cooler", group_id: "combo", grouped_with: "Yağ Değişimi", type_key: "cooler", type_label: "Intercooler Bakımı", maintenance_duration_minutes: 300, technician_contributions: [{ contribution_role: "responsible", duration_minutes: 300 }] }),
  ];

  assert.equal(uniqueMaintenanceEvents(records).length, 3);
  const summaries = maintenanceTypeDurationSummaries(records);
  const oil = summaries.find((item) => item.type === "Yağ Değişimi");
  const cooler = summaries.find((item) => item.type === "Intercooler Bakımı");
  assert.deepEqual(oil, { type: "Yağ Değişimi", count: 2, minutes: 420, estimatedCount: 0 });
  assert.deepEqual(cooler, { type: "Intercooler Bakımı", count: 2, minutes: 360, estimatedCount: 1 });
  assert.equal(durationMinutes(records.find((item) => item._id === "combo-oil")!), 300);
});

test("combined maintenance without history preserves the main duration and gives extras a marked fallback estimate", () => {
  const records = [
    record({ _id: "combo-main", group_id: "combo", grouped_with: null, type_key: "first", type_label: "Bakım A", technician_contributions: [{ contribution_role: "responsible", duration_minutes: 121 }] }),
    record({ _id: "combo-extra", group_id: "combo", grouped_with: "Bakım A", type_key: "second", type_label: "Bakım B", technician_contributions: [{ contribution_role: "responsible", duration_minutes: 121 }] }),
  ];
  const summaries = maintenanceTypeDurationSummaries(records);
  assert.equal(summaries.length, 2);
  assert.equal(summaries.find((item) => item.type === "Bakım A")?.minutes, 121);
  assert.equal(summaries.find((item) => item.type === "Bakım A")?.estimatedCount, 0);
  assert.equal(summaries.find((item) => item.type === "Bakım B")?.minutes, 61);
  assert.equal(summaries.find((item) => item.type === "Bakım B")?.estimatedCount, 1);
});
