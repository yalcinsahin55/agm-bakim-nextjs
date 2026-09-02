import assert from "node:assert/strict";
import test from "node:test";
import { analyticsWorkRange, groupPeriodLabel } from "../lib/analyticsPeriods.ts";

test("weekly analytics range is bounded to the current Monday-Sunday week", () => {
  const range = analyticsWorkRange(new Date("2026-09-02T12:00:00.000Z"), "week");
  assert.ok(range);
  assert.equal(range.from.toISOString(), "2026-08-31T00:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-09-06T23:59:59.999Z");
});

test("monthly analytics range covers the last twelve months through now", () => {
  const now = new Date("2026-09-02T12:00:00.000Z");
  const range = analyticsWorkRange(now, "month");
  assert.ok(range);
  assert.equal(range.from.toISOString(), "2025-10-01T00:00:00.000Z");
  assert.equal(range.to, now);
});

test("selected month creates an exact calendar-month range", () => {
  const range = analyticsWorkRange(new Date("2026-09-02T12:00:00.000Z"), "month", { month: "2026-08" });
  assert.ok(range);
  assert.equal(range.from.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-08-31T23:59:59.999Z");
});

test("selected week and custom dates override the default period", () => {
  const week = analyticsWorkRange(new Date("2026-09-02T12:00:00.000Z"), "week", { weekStart: "2026-08-17" });
  assert.ok(week);
  assert.equal(week.from.toISOString(), "2026-08-17T00:00:00.000Z");
  assert.equal(week.to.toISOString(), "2026-08-23T23:59:59.999Z");
  const custom = analyticsWorkRange(new Date("2026-09-02T12:00:00.000Z"), "total", { from: "2026-08-01", to: "2026-08-05" });
  assert.ok(custom);
  assert.equal(custom.from.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(custom.to.toISOString(), "2026-08-05T23:59:59.999Z");
});

test("total analytics range has no date restriction", () => {
  assert.equal(analyticsWorkRange(new Date("2026-09-02T12:00:00.000Z"), "total"), null);
  assert.equal(groupPeriodLabel("2026-09", "2026-W36"), "2026-09 · 2026-W36");
});
