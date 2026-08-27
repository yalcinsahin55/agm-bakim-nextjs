import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

const root = process.cwd();

test("motor health details keeps current hours and load visible", async () => {
  const dashboard = await readFile(path.join(root, "app/dashboard/page.tsx"), "utf8");
  const healthDetails = await readFile(path.join(root, "app/dashboard/_components/EngineHealthDetails.tsx"), "utf8");

  assert.match(healthDetails, /Güncel motor saati:/);
  assert.match(healthDetails, /Güncel motor yükü:/);
  assert.match(healthDetails, /engine\.load_kw/);
  assert.match(healthDetails, /Yük verisi yok/);
  assert.match(healthDetails, /Number\.isFinite\(engine\.load_kw\)/);
  assert.match(dashboard, /<EngineHealthDetails/);
});
