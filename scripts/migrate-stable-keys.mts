#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { MongoClient, type Db, type UpdateFilter } from "mongodb";

type MigrationDocument = {
  _id: string;
  stable_id?: unknown;
  [key: string]: unknown;
};
type ParsedArgs = { values: Record<string, string>; flags: Set<string> };
type StableKeyTarget = { collection: string; label: string };
type StableKeyChange = { collection: string; id: string; stable_id: string };
type StableKeyTargetReport = { label: string; total: number; existing: number; missing: number; invalid: number };
type StableKeyReport = {
  mode: "dry-run" | "apply";
  generated_at: string;
  targets: Record<string, StableKeyTargetReport>;
  changes: StableKeyChange[];
  warnings: string[];
};
type StableKeyBackup = { version: 1; generated_at: string; changes: StableKeyChange[] };

const DEFAULT_OUTPUT_DIR = "migration-output";
const APPLY_CONFIRM = "APPLY-STABLE-KEY-MIGRATION";
const ROLLBACK_CONFIRM = "ROLLBACK-STABLE-KEY-MIGRATION";
const TARGETS: StableKeyTarget[] = [
  { collection: "users", label: "kullanıcı" },
  { collection: "engines", label: "motor" },
  { collection: "equipment_info", label: "motor bilgi kartı" },
];

function parseArgs(argv: readonly string[]): ParsedArgs {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const raw = argument.slice(2);
    const separator = raw.indexOf("=");
    if (separator === -1) flags.add(raw);
    else values[raw.slice(0, separator)] = raw.slice(separator + 1);
  }
  return { values, flags };
}

function hasFlag(flags: ReadonlySet<string>, name: string): boolean {
  return flags.has(name);
}

function readArg(values: Readonly<Record<string, string>>, name: string, fallback = ""): string {
  const value = values[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, filePath);
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getMongoConfig(): { uri: string; dbName?: string } {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI gerekli.");
  return { uri, dbName: process.env.MONGO_DB_NAME || undefined };
}

function isStableKeyChange(value: unknown): value is StableKeyChange {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.collection === "string" && typeof candidate.id === "string" && isStableId(candidate.stable_id);
}

function isStableKeyBackup(value: unknown): value is StableKeyBackup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.version === 1 && typeof candidate.generated_at === "string" && Array.isArray(candidate.changes) && candidate.changes.every(isStableKeyChange);
}

async function scan(db: Db): Promise<StableKeyReport> {
  const report: StableKeyReport = {
    mode: "dry-run",
    generated_at: new Date().toISOString(),
    targets: {},
    changes: [],
    warnings: [],
  };

  for (const target of TARGETS) {
    const collection = db.collection<MigrationDocument>(target.collection);
    const documents = await collection.find({}, { projection: { _id: 1, stable_id: 1 } }).toArray();
    const existing = new Set<string>();
    let existingCount = 0;
    const missing: string[] = [];
    const invalid: string[] = [];

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

async function applyChanges(db: Db, changes: readonly StableKeyChange[], backupPath: string): Promise<StableKeyBackup> {
  const backup: StableKeyBackup = { version: 1, generated_at: new Date().toISOString(), changes: [] };
  for (const change of changes) {
    const collection = db.collection<MigrationDocument>(change.collection);
    const current = await collection.findOne({ _id: change.id }, { projection: { _id: 1, stable_id: 1 } });
    if (!current || isStableId(current.stable_id)) continue;
    const filter: Record<string, unknown> = {
      _id: change.id,
      $or: [{ stable_id: { $exists: false } }, { stable_id: null }, { stable_id: "" }],
    };
    const update: UpdateFilter<MigrationDocument> = { $set: { stable_id: change.stable_id } };
    const result = await collection.updateOne(filter, update);
    if (result.modifiedCount === 1) backup.changes.push(change);
  }
  writeJsonAtomic(backupPath, backup);
  return backup;
}

async function rollback(db: Db, rollbackPath: string): Promise<{ rolledBack: number; requested: number }> {
  if (!existsSync(rollbackPath)) throw new Error(`Rollback dosyası bulunamadı: ${rollbackPath}`);
  const parsed: unknown = JSON.parse(readFileSync(rollbackPath, "utf8"));
  if (!isStableKeyBackup(parsed)) throw new Error("Geçersiz stable key rollback dosyası.");
  let rolledBack = 0;
  for (const change of parsed.changes) {
    const collection = db.collection<MigrationDocument>(change.collection);
    const filter: Record<string, unknown> = { _id: change.id, stable_id: change.stable_id };
    const update: UpdateFilter<MigrationDocument> = { $unset: { stable_id: "" } };
    const result = await collection.updateOne(filter, update);
    rolledBack += result.modifiedCount;
  }
  return { rolledBack, requested: parsed.changes.length };
}

async function main(): Promise<void> {
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
    const db = client.db(dbName);
    if (isRollback) {
      if (!isApply) throw new Error("Rollback yalnızca --apply ve doğru onay token’ı ile çalışır.");
      const result = await rollback(db, resolve(rollbackPath));
      writeJsonAtomic(reportPath, { mode: "rollback", generated_at: new Date().toISOString(), ...result });
      console.log(JSON.stringify({ mode: "rollback", report: reportPath, ...result }, null, 2));
      return;
    }

    const report = await scan(db);
    if (!isApply) {
      writeJsonAtomic(reportPath, report);
      console.log(JSON.stringify({ mode: "dry-run", report: reportPath, targets: report.targets, changes: report.changes.length, warnings: report.warnings.length }, null, 2));
      return;
    }

    const maxChanges = Math.max(1, Math.min(Number.parseInt(readArg(values, "max-changes", "1000"), 10) || 1000, 10000));
    if (report.changes.length > maxChanges) throw new Error(`${report.changes.length} değişiklik üst sınırı ${maxChanges} değerini aşıyor.`);
    const backupPath = resolve(readArg(values, "backup", `${outputDir}/stable-keys-backup.json`));
    const backup = await applyChanges(db, report.changes, backupPath);
    const applied: StableKeyReport & { mode: "apply"; applied: number; backup: string } = { ...report, mode: "apply", applied: backup.changes.length, backup: backupPath };
    writeJsonAtomic(reportPath, applied);
    console.log(JSON.stringify({ mode: "apply", report: reportPath, backup: backupPath, applied: backup.changes.length }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stable key migration failed");
  process.exitCode = 1;
});
