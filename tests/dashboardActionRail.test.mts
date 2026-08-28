import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/DashboardActionRail.tsx", import.meta.url);

test("dashboard action rail stays permission-filtered and read-only", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /canAccessRoute\(props\.role, action\.accessPath \|\| action\.href\)/);
  assert.match(source, /\/tamamla/);
  assert.match(source, /\/kayitlar/);
  assert.match(source, /#dashboard-health-details/);
  assert.match(source, /accessPath: "\/dashboard"/);
  assert.match(source, /\/bakim-turleri/);
  assert.match(source, /\/bildirimler/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /method:\s*["']POST/);
});
