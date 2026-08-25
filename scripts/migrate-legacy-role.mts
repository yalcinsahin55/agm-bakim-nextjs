#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { MongoClient, type Db, type UpdateFilter } from "mongodb";

type MigrationDocument = { _id: string; role?: unknown; full_name?: unknown; technician_type?: unknown; [key: string]: unknown };
type ParsedArgs = { values: Record<string, string>; flags: Set<string> };
type RoleChange = { id: string; from: string; to: "teknisyen"; full_name: unknown; technician_type: unknown };
type RoleReport = { version: 1; mode: "dry-run" | "apply"; generated_at: string; total: number; changes: RoleChange[] };
type RoleBackup = { version: 1; generated_at: string; changes: RoleChange[] };

const DEFAULT_OUTPUT_DIR = "migration-output";
const APPLY_CONFIRM = "APPLY-LEGACY-ROLE-MIGRATION";
const ROLLBACK_CONFIRM = "ROLLBACK-LEGACY-ROLE-MIGRATION";

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
function hasFlag(flags: ReadonlySet<string>, name: string): boolean { return flags.has(name); }
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
function isRoleChange(value: unknown): value is RoleChange {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.from === "string" && candidate.to === "teknisyen";
}
function isRoleBackup(value: unknown): value is RoleBackup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.version === 1 && typeof candidate.generated_at === "string" && Array.isArray(candidate.changes) && candidate.changes.every(isRoleChange);
}
async function scan(db: Db): Promise<RoleReport> {
  const users = await db.collection<MigrationDocument>("users").find({ role: "planlamaci" }, {
    projection: { _id: 1, role: 1, full_name: 1, technician_type: 1, can_be_responsible: 1, can_be_support: 1, allowed_work_domains: 1 },
  }).toArray();
  return {
    version: 1,
    mode: "dry-run",
    generated_at: new Date().toISOString(),
    total: users.length,
    changes: users.map((user) => ({
      id: String(user._id),
      from: typeof user.role === "string" ? user.role : "planlamaci",
      to: "teknisyen",
      full_name: user.full_name,
      technician_type: user.technician_type || "mekanik",
    })),
  };
}
async function apply(db: Db, changes: readonly RoleChange[], backupPath: string): Promise<RoleBackup> {
  const backup: RoleBackup = { version: 1, generated_at: new Date().toISOString(), changes: [] };
  for (const change of changes) {
    const update: UpdateFilter<MigrationDocument> = { $set: { role: "teknisyen" } };
    const result = await db.collection<MigrationDocument>("users").updateOne({ _id: change.id, role: "planlamaci" }, update);
    if (result.modifiedCount === 1) backup.changes.push(change);
  }
  writeJsonAtomic(backupPath, backup);
  return backup;
}
async function rollback(db: Db, rollbackPath: string): Promise<{ rolledBack: number; requested: number }> {
  if (!existsSync(rollbackPath)) throw new Error(`Rollback dosyası bulunamadı: ${rollbackPath}`);
  const parsed: unknown = JSON.parse(readFileSync(rollbackPath, "utf8"));
  if (!isRoleBackup(parsed)) throw new Error("Geçersiz role rollback dosyası.");
  let rolledBack = 0;
  for (const change of parsed.changes) {
    const update: UpdateFilter<MigrationDocument> = { $set: { role: "planlamaci" } };
    const result = await db.collection<MigrationDocument>("users").updateOne({ _id: change.id, role: "teknisyen" }, update);
    rolledBack += result.modifiedCount;
  }
  return { rolledBack, requested: parsed.changes.length };
}
async function main(): Promise<void> {
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
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI gerekli.");
  const client = new MongoClient(uri);
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
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Legacy role migration failed");
  process.exitCode = 1;
});
