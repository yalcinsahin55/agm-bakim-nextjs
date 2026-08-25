#!/usr/bin/env node
// @ts-nocheck
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

const DEFAULT_OUTPUT_DIR = "migration-output";
const APPLY_CONFIRM = "APPLY-STABLE-KEY-MIGRATION";
const ROLLBACK_CONFIRM = "ROLLBACK-STABLE-KEY-MIGRATION";
const TARGETS = [
  { collection: "users", label: "kullanıcı" },
  { collection: "engines", label: "motor" },
  { collection: "equipment_info", label: "motor bilgi kartı" },
];

function parseArgs(argv) {
  const values = {};
  const flags = new Set();
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const raw = argument.slice(2);
    const separator = raw.indexOf("=");
    if (separator === -1) flags.add(raw);
    else values[raw.slice(0, separator)] = raw.slice(separator + 1);
  }
  return { values, flags };
}

function hasFlag(flags, name) {
  return flags.has(name);
}

function readArg(values, name, fallback = "") {
  return typeof values[name] === "string" && values[name].trim() ? values[name].trim() : fallback;
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, filePath);
}

function isStableId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getMongoConfig() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI gerekli.");
  return { uri, dbName: process.env.MONGO_DB_NAME || undefined };
}

async function scan(client) {
  const db = client.db();
  const report = {
    mode: "dry-run",
    generated_at: new Date().toISOString(),
    targets: {},
    changes: [],
    warnings: [],
  };

  for (const target of TARGETS) {
    const collection = db.collection(target.collection);
    const documents = await collection.find({}, { projection: { _id: 1, stable_id: 1 } }).toArray();
    const existing = new Set();
    let existingCount = 0;
    const missing = [];
    const invalid = [];

    for (const document of documents) {
      const id = String(document._id);
      if (isStableId(document.stable_id)) {
        existingCount += 1;
        if (existing.has(document.stable_id)) report.warnings.push(`${target.collection}/${id}: duplicate stable_id`);
        existing.add(document.stable_id);
      } else if (document.stable_id === undefined || document.stable_id === null || document.stable_id === "") {
        missing.push(id);
      } else {
        invalid.push(id);
      }
    }

    report.targets[target.collection] = {
      label: target.label,
      total: documents.length,
      existing: existingCount,
      missing: missing.length,
      invalid: invalid.length,
    };
    for (const id of missing) report.changes.push({ collection: target.collection, id, stable_id: randomUUID() });
    for (const id of invalid) report.warnings.push(`${target.collection}/${id}: invalid stable_id, unchanged`);
  }
  return report;
}

async function applyChanges(client, changes, backupPath) {
  const db = client.db();
  const backup = { version: 1, generated_at: new Date().toISOString(), changes: [] };
  for (const change of changes) {
    const collection = db.collection(change.collection);
    const current = await collection.findOne({ _id: change.id }, { projection: { _id: 1, stable_id: 1 } });
    if (!current) continue;
    if (isStableId(current.stable_id)) continue;
    const result = await collection.updateOne(
      { _id: change.id, $or: [{ stable_id: { $exists: false } }, { stable_id: null }, { stable_id: "" }] },
      { $set: { stable_id: change.stable_id } },
    );
    if (result.modifiedCount === 1) backup.changes.push({ collection: change.collection, id: change.id, stable_id: change.stable_id });
  }
  writeJsonAtomic(backupPath, backup);
  return backup;
}

async function rollback(client, rollbackPath) {
  if (!existsSync(rollbackPath)) throw new Error(`Rollback dosyası bulunamadı: ${rollbackPath}`);
  const backup = JSON.parse(readFileSync(rollbackPath, "utf8"));
  if (!backup || backup.version !== 1 || !Array.isArray(backup.changes)) throw new Error("Geçersiz stable key rollback dosyası.");
  const db = client.db();
  let rolledBack = 0;
  for (const change of backup.changes) {
    if (!change || typeof change.collection !== "string" || typeof change.id !== "string" || !isStableId(change.stable_id)) continue;
    const result = await db.collection(change.collection).updateOne(
      { _id: change.id, stable_id: change.stable_id },
      { $unset: { stable_id: "" } },
    );
    rolledBack += result.modifiedCount;
  }
  return { rolledBack, requested: backup.changes.length };
}

async function main() {
  const { values, flags } = parseArgs(process.argv.slice(2));
  const outputDir = resolve(readArg(values, "output-dir", DEFAULT_OUTPUT_DIR));
  const reportPath = resolve(readArg(values, "report", `${outputDir}/stable-keys-preview.json`));
  const rollbackPath = readArg(values, "rollback");
  const isRollback = Boolean(rollbackPath);
  const isApply = hasFlag(flags, "apply");
  const confirmation = readArg(values, "confirm");
  if (isApply && confirmation !== (isRollback ? ROLLBACK_CONFIRM : APPLY_CONFIRM)) {
    throw new Error(`Apply için --confirm=${isRollback ? ROLLBACK_CONFIRM : APPLY_CONFIRM} gereklidir.`);
  }

  const { uri, dbName } = getMongoConfig();
  const client = new MongoClient(uri);
  await client.connect();
  try {
    if (isRollback) {
      if (!isApply) throw new Error("Rollback yalnızca --apply ve doğru onay token’ı ile çalışır.");
      const result = await rollback(client.db(dbName), resolve(rollbackPath));
      writeJsonAtomic(reportPath, { mode: "rollback", generated_at: new Date().toISOString(), ...result });
      console.log(JSON.stringify({ mode: "rollback", report: reportPath, ...result }, null, 2));
      return;
    }

    const report = await scan(client.db(dbName));
    if (!isApply) {
      writeJsonAtomic(reportPath, report);
      console.log(JSON.stringify({ mode: "dry-run", report: reportPath, targets: report.targets, changes: report.changes.length, warnings: report.warnings.length }, null, 2));
      return;
    }

    const maxChanges = Math.max(1, Math.min(Number.parseInt(readArg(values, "max-changes", "1000"), 10) || 1000, 10000));
    if (report.changes.length > maxChanges) throw new Error(`${report.changes.length} değişiklik üst sınırı ${maxChanges} değerini aşıyor.`);
    const backupPath = resolve(readArg(values, "backup", `${outputDir}/stable-keys-backup.json`));
    const backup = await applyChanges(client.db(dbName), report.changes, backupPath);
    const applied = { ...report, mode: "apply", applied: backup.changes.length, backup: backupPath };
    writeJsonAtomic(reportPath, applied);
    console.log(JSON.stringify({ mode: "apply", report: reportPath, backup: backupPath, applied: backup.changes.length }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Stable key migration failed");
  process.exitCode = 1;
});
