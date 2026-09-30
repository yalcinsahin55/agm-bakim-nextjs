import test from "node:test";
import assert from "node:assert/strict";
import { getCompletionHourRule, getCompletionHourValidationError, latestExcelHourSnapshot } from "../lib/engineHoursRules.ts";

test("latest Excel snapshot is selected by measurement time", () => {
  const snapshot = latestExcelHourSnapshot([
    { date: "2026-09-20T00:00:00.000Z", hours: 100, load_kw: 0, source: "excel" },
    { date: "2026-09-21T00:00:00.000Z", hours: 120, load_kw: 0, source: "excel" },
    { date: "2026-09-22T00:00:00.000Z", hours: 150, load_kw: 0, source: "record" },
  ]);
  assert.deepEqual(snapshot, { date: "2026-09-21T00:00:00.000Z", hours: 120 });
});

test("completion hour maximum follows elapsed time since Excel measurement", () => {
  const rule = getCompletionHourRule(
    120,
    [{ date: "2026-09-21T00:00:00.000Z", hours: 120, load_kw: 0, source: "excel" }],
    "2026-09-21T10:00:00.000Z",
  );
  assert.equal(rule.minimumHours, 96);
  assert.equal(rule.maximumHours, 130);
  assert.equal(getCompletionHourValidationError(130, 120, [{ date: "2026-09-21T00:00:00.000Z", hours: 120, load_kw: 0, source: "excel" }], "2026-09-21T10:00:00.000Z"), null);
  assert.match(getCompletionHourValidationError(131, 120, [{ date: "2026-09-21T00:00:00.000Z", hours: 120, load_kw: 0, source: "excel" }], "2026-09-21T10:00:00.000Z") || "", /en yüksek değer/);
});

test("completion hour cannot be more than 24 hours below current engine hours", () => {
  const error = getCompletionHourValidationError(95, 120, undefined, "2026-09-21T10:00:00.000Z");
  assert.match(error || "", /en fazla 24 saat düşük/);
  assert.equal(getCompletionHourValidationError(96, 120, undefined, "2026-09-21T10:00:00.000Z"), null);
});

test("backdated completion uses the engine hour estimated for the maintenance date", () => {
  const history = [{ date: "2026-09-30T00:00:00.000Z", hours: 2_000, load_kw: 0, source: "excel" as const }];
  const rule = getCompletionHourRule(2_000, history, "2026-09-28T12:00:00.000Z", "2026-09-30T12:00:00.000Z");
  assert.equal(rule.minimumHours, 1_928);
  assert.equal(rule.maximumHours, 2_000);
  assert.equal(getCompletionHourValidationError(1_940, 2_000, history, "2026-09-28T12:00:00.000Z", "2026-09-30T12:00:00.000Z"), null);
  assert.equal(getCompletionHourValidationError(1_980, 2_000, history, "2026-09-28T12:00:00.000Z", "2026-09-30T12:00:00.000Z"), null);
  assert.match(getCompletionHourValidationError(1_927, 2_000, history, "2026-09-28T12:00:00.000Z", "2026-09-30T12:00:00.000Z") || "", /En düşük değer/);
});
