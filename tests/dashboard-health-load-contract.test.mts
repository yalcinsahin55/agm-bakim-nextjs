import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

const root = process.cwd();

test("motor health details keeps current hours and load visible", async () => {
  const dashboard = await readFile(path.join(root, "app/dashboard/page.tsx"), "utf8");

  assert.match(dashboard, /Güncel motor saati:/);
  assert.match(dashboard, /Güncel motor yükü:/);
  assert.match(dashboard, /engine\.load_kw/);
  assert.match(dashboard, /Yük verisi yok/);
  assert.match(dashboard, /Number\.isFinite\(engine\.load_kw\)/);
});
