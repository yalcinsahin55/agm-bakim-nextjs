import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string): Promise<string> => readFile(path.join(root, relativePath), "utf8");

test("oil PDF migration keeps dry-run, confirmation, backup, and rollback safeguards", async () => {
  const migration = await source("scripts/migrate-legacy-oil-pdfs.mts");
  const wrapper = await source("scripts/vercel-legacy-oil-pdf-dry-run.mts");
  const pilot = await source("scripts/vercel-legacy-oil-pdf-pilot.mts");
  const batchA = await source("scripts/vercel-legacy-oil-pdf-batch-a.mts");
  assert.match(migration, /const APPLY_CONFIRM = "APPLY-LEGACY-OIL-PDFS"/);
  assert.match(migration, /const ROLLBACK_CONFIRM = "ROLLBACK-LEGACY-OIL-PDFS"/);
  assert.match(migration, /if \(isApply && readArg\(values, "confirm"\) !== expectedConfirm\)/);
  assert.match(migration, /access: "private"/);
  assert.match(migration, /addRandomSuffix: false/);
  assert.match(migration, /allowOverwrite: true/);
  assert.match(migration, /createHash\("sha256"\)/);
  assert.match(migration, /\$unset: \{ pdf_b64: "" \}/);
  assert.match(migration, /legacy_oil_pdf_migration_backup_items/);
  assert.match(migration, /legacy_oil_pdf_migration_runs/);
  assert.doesNotMatch(migration, /randomUUID\(/);
  assert.match(wrapper, /migration-oil-pdf-dry-run/);
  assert.match(wrapper, /mode: "dry-run"/);
  assert.match(pilot, /--apply/);
  assert.match(pilot, /--confirm=APPLY-LEGACY-OIL-PDFS/);
  assert.match(pilot, /--max-changes=3/);
  assert.match(pilot, /--run-id=/);
  assert.match(pilot, /mode: "apply"/);
  assert.match(batchA, /migration-oil-pdf-batch-a/);
  assert.match(batchA, /--max-changes=6/);
  assert.match(batchA, /--offset=0/);
  assert.match(batchA, /mode: "apply"/);
});

test("oil PDF migration preserves existing PDF URL records and validates PDF bytes", async () => {
  const migration = await source("scripts/migrate-legacy-oil-pdfs.mts");
  assert.match(migration, /reason: "existing_pdf_url"/);
  assert.match(migration, /looksLikePdf\(buffer\)/);
  assert.match(migration, /MAX_PDF_BYTES/);
  assert.match(migration, /pdf_url: blob\.url/);
});
