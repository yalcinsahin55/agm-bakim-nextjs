import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/DashboardActionRail.tsx", import.meta.url);

test("dashboard operation cockpit keeps role-specific presentation and permissions", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /normalizeRole\(role\)/);
  assert.match(source, /YALNIZCA İZLEME/);
  assert.match(source, /AKSİYON ODAKLI/);
  assert.match(source, /canWriteMaintenance\(role\)/);
  assert.match(source, /canAccessRoute\(props\.role, action\.href\)/);
  assert.match(source, /href: `\/tamamla\?engine_id=/);
  assert.match(source, /href: `\/dashboard\?engine=/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /method:\s*["']POST/);
});

test("dashboard operation cockpit exposes the existing four read/write destinations", async () => {
  const source = await readFile(componentPath, "utf8");

  for (const path of ["/tamamla", "/kayitlar", "/motorlar", "/bildirimler"]) {
    assert.match(source, new RegExp(path.replace("/", "\\/")));
  }
});
