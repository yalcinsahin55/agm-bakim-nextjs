import assert from "node:assert/strict";
import test from "node:test";
import { sortTechnicianSummary } from "../lib/technicianSummary.ts";

test("technician summary sorts by total duration before task count", () => {
  const rows = sortTechnicianSummary([
    { technician_id: "a", technician: "Asım", total_count: 15, total_duration_minutes: 1870 },
    { technician_id: "b", technician: "Muhammet", total_count: 14, total_duration_minutes: 1335 },
    { technician_id: "c", technician: "Sezai", total_count: 11, total_duration_minutes: 1410 },
  ]);

  assert.deepEqual(rows.map((row) => row.technician), ["Asım", "Sezai", "Muhammet"]);
});

test("technician summary uses task count and then name only as deterministic tie breakers", () => {
  const rows = sortTechnicianSummary([
    { technician_id: "a", technician: "Zeynep", total_count: 2, total_duration_minutes: 120 },
    { technician_id: "b", technician: "Asım", total_count: 3, total_duration_minutes: 120 },
    { technician_id: "c", technician: "Berk", total_count: 3, total_duration_minutes: 120 },
  ]);

  assert.deepEqual(rows.map((row) => row.technician), ["Asım", "Berk", "Zeynep"]);
});
