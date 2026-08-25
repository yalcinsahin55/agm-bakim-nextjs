#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { MongoClient } from "mongodb";

const DEFAULT_OUTPUT_DIR = "migration-output";
const APPLY_CONFIRM = "APPLY-LEGACY-ROLE-MIGRATION";
const ROLLBACK_CONFIRM = "ROLLBACK-LEGACY-ROLE-MIGRATION";

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

async function scan(db) {
  const users = await db.collection("users").find({ role: "planlamaci" }, {
    projection: { _id: 1, role: 1, full_name: 1, technician_type: 1, can_be_responsible: 1, can_be_support: 1, allowed_work_domains: 1 },
  }).toArray();
  return {
    version: 1,
    mode: "dry-run",
    generated_at: new Date().toISOString(),
    total: users.length,
    changes: users.map((user) => ({
      id: String(user._id),
      from: user.role,
      to: "teknisyen",
      full_name: user.full_name,
      technician_type: user.technician_type || "mekanik",
    })),
  };
}

async function apply(db, changes, backupPath) {
  const backup = { version: 1, generated_at: new Date().toISOString(), changes: [] };
  for (const change of changes) {
    const result = await db.collection("users").updateOne(
      { _id: change.id, role: "planlamaci" },
      { $set: { role: "teknisyen" } },
    );
    if (result.modifiedCount === 1) backup.changes.push(change);
  }
  writeJsonAtomic(backupPath, backup);
  return backup;
}

async function rollback(db, rollbackPath) {
  if (!existsSync(rollbackPath)) throw new Error(`Rollback dosyası bulunamadı: ${rollbackPath}`);
  const backup = JSON.parse(readFileSync(rollbackPath, "utf8"));
  if (!backup || backup.version !== 1 || !Array.isArray(backup.changes)) throw new Error("Geçersiz role rollback dosyası.");
  let rolledBack = 0;
  for (const change of backup.changes) {
    if (!change || typeof change.id !== "string") continue;
    const result = await db.collection("users").updateOne({ _id: change.id, role: "teknisyen" }, { $set: { role: "planlamaci" } });
    rolledBack += result.modifiedCount;
  }
  return { rolledBack, requested: backup.changes.length };
}

async function main() {
  const { values, flags } = parseArgs(process.argv.slice(2));
  const outputDir = resolve(readArg(values, "output-dir", DEFAULT_OUTPUT_DIR));
  const reportPath = resolve(readArg(values, "report", `${outputDir}/legacy-role-preview.json`));
  const rollbackPath = readArg(values, "rollback");
  const isRollback = Boolean(rollbackPath);
  const isApply = hasFlag(flags, "apply");
  const confirmation = readArg(values, "confirm");
  const requiredConfirm = isRollback ? ROLLBACK_CONFIRM : APPLY_CONFIRM;
  if (isApply && confirmation !== requiredConfirm) throw new Error(`Apply için --confirm=${requiredConfirm} gereklidir.`);
  if (isRollback && !isApply) throw new Error("Rollback yalnızca --apply ve doğru onay token’ı ile çalışır.");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI gerekli.");

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  try {
    const db = client.db(process.env.MONGO_DB_NAME || undefined);
    if (isRollback) {
      const result = await rollback(db, resolve(rollbackPath));
      writeJsonAtomic(reportPath, { mode: "rollback", generated_at: new Date().toISOString(), ...result });
      console.log(JSON.stringify({ mode: "rollback", report: reportPath, ...result }, null, 2));
      return;
    }

    const report = await scan(db);
    if (!isApply) {
      writeJsonAtomic(reportPath, report);
      console.log(JSON.stringify({ mode: "dry-run", report: reportPath, total: report.total }, null, 2));
      return;
    }

    const maxChanges = Math.max(1, Math.min(Number.parseInt(readArg(values, "max-changes", "1000"), 10) || 1000, 10000));
    if (report.changes.length > maxChanges) throw new Error(`${report.changes.length} değişiklik üst sınırı ${maxChanges} değerini aşıyor.`);
    const backupPath = resolve(readArg(values, "backup", `${outputDir}/legacy-role-backup.json`));
    const backup = await apply(db, report.changes, backupPath);
    writeJsonAtomic(reportPath, { ...report, mode: "apply", applied: backup.changes.length, backup: backupPath });
    console.log(JSON.stringify({ mode: "apply", report: reportPath, backup: backupPath, applied: backup.changes.length }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Legacy role migration failed");
  process.exitCode = 1;
});
