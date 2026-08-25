// @ts-nocheck
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { MongoClient, ObjectId } from "mongodb";

const DEFAULT_OUTPUT_DIR = "migration-output";
const APPLY_CONFIRM = "APPLY-GROUPED-MAINTENANCE-MIGRATION";
const ROLLBACK_CONFIRM = "ROLLBACK-GROUPED-MAINTENANCE-MIGRATION";

function parseArgs(argv) {
  const values = {};
  const flags = new Set();
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const value = argument.slice(2);
    const separator = value.indexOf("=");
    if (separator === -1) flags.add(value);
    else values[value.slice(0, separator)] = value.slice(separator + 1);
  }
  return { values, flags };
}

function hasFlag(flags, name) {
  return flags.has(name);
}

function readArg(values, name, fallback = "") {
  return typeof values[name] === "string" && values[name].trim() ? values[name].trim() : fallback;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function getRecordId(record) {
  return record?._id == null ? "" : String(record._id);
}

function recordIdFilter(value) {
  if (typeof value !== "string" || !/^[0-9a-fA-F]{24}$/.test(value)) return { _id: value };
  return { _id: { $in: [value, new ObjectId(value)] } };
}

function hasGroupId(record) {
  return record?.group_id !== undefined && record?.group_id !== null && String(record.group_id).trim() !== "";
}

function canonicalDate(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : value.trim();
  }
  return "";
}

function contributionFingerprint(record) {
  if (!Array.isArray(record?.technician_contributions) || record.technician_contributions.length === 0) return "";
  return JSON.stringify(record.technician_contributions.map((item) => ({
    id: item?.id || "",
    role: item?.contribution_role || "",
    duration: Number(item?.duration_minutes || 0),
  })).sort((a, b) => `${a.role}:${a.id}`.localeCompare(`${b.role}:${b.id}`)));
}

function inferSignature(record) {
  const start = canonicalDate(record.maintenance_start_at || record.created_at);
  const end = canonicalDate(record.maintenance_end_at);
  const sharedClientRequestId = typeof record.client_request_id === "string" ? record.client_request_id.trim().replace(/:extra:[^:]+$/, "") : "";
  const fingerprint = contributionFingerprint(record);
  if (!record.engine_id || !start || !Number.isFinite(Number(record.hour_at_completion))) return null;
  return [
    String(record.engine_id),
    start,
    end,
    Number(record.hour_at_completion),
    String(record.technician_id || ""),
    fingerprint,
    sharedClientRequestId,
  ].join("|");
}

function stableGroupId(signature) {
  return `legacy_group_${createHash("sha256").update(signature).digest("hex").slice(0, 24)}`;
}

function makeBackupEntry(record) {
  return {
    _id: getRecordId(record),
    group_id_present: Object.prototype.hasOwnProperty.call(record, "group_id"),
    group_id: record.group_id,
  };
}

function restoreUpdate(entry) {
  if (entry.group_id_present) return { $set: { group_id: entry.group_id } };
  return { $unset: { group_id: "" } };
}

function makeOutputPath(explicitPath, prefix, timestamp) {
  if (explicitPath) return resolve(explicitPath);
  mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
  return resolve(DEFAULT_OUTPUT_DIR, `${prefix}-${timestamp}.json`);
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, filePath);
}

function printHelp() {
  console.log(`
Gruplu bakım kayıtları süre tekilleştirme migration aracı

Bu araç, ayrı bakım türü satırları olarak saklanan fakat aynı işlemde tamamlandığı güçlü biçimde anlaşılan eski kayıtlara eksik group_id ekler. Kayıtların teknisyen katkılarını, sürelerini, tarihlerini veya bakım türlerini değiştirmez.

Varsayılan davranış dry-run'dır; hiçbir veritabanı kaydı değiştirilmez.

Kullanım:
  node scripts/migrate-grouped-maintenance-records.mts --report=migration-output/grouped-preview.json
  node scripts/migrate-grouped-maintenance-records.mts --apply --confirm=${APPLY_CONFIRM}
  node scripts/migrate-grouped-maintenance-records.mts --rollback=migration-output/grouped-backup.json --apply --confirm=${ROLLBACK_CONFIRM}

Seçenekler:
  --apply                 Eksik group_id alanlarını uygular. Tek başına yeterli değildir.
  --confirm=...           Apply/rollback için gereken açık onay metni.
  --report=PATH           Dry-run/uygulama raporu yolu.
  --backup=PATH           Apply modunda group_id yedeği yolu.
  --max-changes=N         Değiştirilecek kayıt üst sınırı (varsayılan: 1000).
  --rollback=PATH         Daha önce oluşturulan backup JSON dosyasını geri yükler.
  --help                  Bu yardım metnini gösterir.

Güvenlik:
  - Mevcut group_id taşıyan gruplara dokunulmaz.
  - Belirsiz veya zayıf eşleşmeler değiştirilmez ve rapora alınır.
  - Varsayılan dry-run hiçbir kayıt değiştirmez.
  - Apply öncesinde yalnızca group_id alanı için atomik backup yazılır.
  - Uygulama hatasında o ana kadar değişen kayıtlar otomatik geri alınır.
`);
}

async function connectDb() {
  loadEnvFile(resolve(".env.local"));
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI tanımlı değil. .env.local yükleyin veya ortam değişkeni olarak verin.");
  const client = new MongoClient(process.env.MONGO_URI, { maxPoolSize: 4, serverSelectionTimeoutMS: 8000 });
  await client.connect();
  return { client, db: client.db(process.env.MONGO_DB_NAME || "agm_bakim") };
}

async function buildPlans(db) {
  const records = await db.collection("maintenance_records").find(
    {},
    { projection: { _id: 1, group_id: 1, engine_id: 1, type_key: 1, type_label: 1, technician_id: 1, maintenance_start_at: 1, maintenance_end_at: 1, created_at: 1, hour_at_completion: 1, client_request_id: 1, grouped_with: 1, technician_contributions: 1 } },
  ).sort({ _id: 1 }).toArray();
  const existingGroups = new Map();
  const signatureGroups = new Map();
  let standalone = 0;
  for (const record of records) {
    if (hasGroupId(record)) {
      const groupId = String(record.group_id);
      const group = existingGroups.get(groupId) || { group_id: groupId, records: [] };
      group.records.push(record);
      existingGroups.set(groupId, group);
      continue;
    }
    const signature = inferSignature(record);
    if (!signature) {
      standalone += 1;
      continue;
    }
    const group = signatureGroups.get(signature) || { signature, records: [] };
    group.records.push(record);
    signatureGroups.set(signature, group);
  }

  const plans = [];
  for (const group of signatureGroups.values()) {
    const uniqueTypes = new Set(group.records.map((record) => String(record.type_key || "")));
    const typeLabels = new Set(group.records.map((record) => String(record.type_label || "").trim()));
    const hasGroupedWithEvidence = group.records.some((record) => {
      const groupedWith = typeof record.grouped_with === "string" ? record.grouped_with.trim() : "";
      return Boolean(groupedWith) && typeLabels.has(groupedWith);
    });
    const hasSharedRequestOrContributionEvidence = group.records.some((record) => Boolean((typeof record.client_request_id === "string" ? record.client_request_id.trim() : "") || contributionFingerprint(record)));
    if (group.records.length < 2 || uniqueTypes.size < 2 || (!hasGroupedWithEvidence && !hasSharedRequestOrContributionEvidence)) {
      standalone += group.records.length;
      continue;
    }
    const groupId = stableGroupId(group.signature);
    for (const record of group.records) {
      plans.push({
        _id: getRecordId(record),
        group_id: groupId,
        type_label: record.type_label || "",
        reason: "strong_legacy_group_match",
      });
    }
  }

  const existingGroupedRecords = [...existingGroups.values()].reduce((sum, group) => sum + group.records.length, 0);
  const existingGroupedGroups = [...existingGroups.values()].filter((group) => group.records.length > 1).length;
  const report = {
    tool: "migrate-grouped-maintenance-records",
    generated_at: new Date().toISOString(),
    collection: "maintenance_records",
    scanned: records.length,
    existing_grouped_groups: existingGroupedGroups,
    existing_grouped_records: existingGroupedRecords,
    inferred_groups: new Set(plans.map((plan) => plan.group_id)).size,
    inferred_records: plans.length,
    standalone_or_unresolved_records: standalone,
    ambiguous_groups: 0,
    planned_changes: plans.length,
    safety: "Only missing group_id fields on strong multi-type legacy groups are changed; contribution, duration, record, technician and media fields remain untouched.",
  };
  return { records, plans, report };
}

async function runMigration(db, options) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = makeOutputPath(options.reportPath, "grouped-maintenance-report", timestamp);
  const backupPath = makeOutputPath(options.backupPath, "grouped-maintenance-backup", timestamp);
  if (!Number.isInteger(options.maxChanges) || options.maxChanges < 1) throw new Error("--max-changes pozitif bir tam sayı olmalıdır.");
  const { plans, report } = await buildPlans(db);
  report.mode = options.apply ? "apply" : "dry-run";
  report.database = process.env.MONGO_DB_NAME || "agm_bakim";
  report.report_path = reportPath;
  report.backup_path = options.apply ? backupPath : null;

  if (!options.apply) {
    writeJsonAtomic(reportPath, { ...report, planned_changes: plans.slice(0, 1000) });
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nDry-run tamamlandı. Hiçbir kayıt değiştirilmedi. Ayrıntılı rapor: ${reportPath}`);
    return;
  }
  if (plans.length > options.maxChanges) throw new Error(`Güvenlik sınırı aşıldı: ${plans.length} değişiklik planlandı, --max-changes=${options.maxChanges}. Önce dry-run raporunu inceleyin.`);

  const collection = db.collection("maintenance_records");
  const backup = { tool: "migrate-grouped-maintenance-records", created_at: new Date().toISOString(), database: process.env.MONGO_DB_NAME || "agm_bakim", collection: "maintenance_records", tracked_fields: ["group_id"], count: plans.length, records: [] };
  for (const plan of plans) {
    const current = await collection.findOne(recordIdFilter(plan._id), { projection: { _id: 1, group_id: 1 } });
    if (!current) throw new Error(`Apply öncesi kayıt bulunamadı: ${plan._id}. İşlem durduruldu.`);
    if (hasGroupId(current)) throw new Error(`Apply öncesi kayıt zaten gruplu: ${plan._id}. Dry-run yenilenmeli.`);
    backup.records.push(makeBackupEntry(current));
  }
  writeJsonAtomic(backupPath, backup);

  const applied = [];
  let updated = 0;
  try {
    for (const plan of plans) {
      const result = await collection.updateOne(
        { ...recordIdFilter(plan._id), $or: [{ group_id: { $exists: false } }, { group_id: null }, { group_id: "" }] },
        { $set: { group_id: plan.group_id } },
      );
      if (result.matchedCount !== 1) throw new Error(`Kayıt güncellenemedi veya eşzamanlı değişti: ${plan._id}. Backup hazır: ${backupPath}`);
      applied.push(backup.records[applied.length]);
      updated += result.modifiedCount;
    }
  } catch (error) {
    let rollbackFailures = 0;
    for (const entry of applied) {
      try { await collection.updateOne(recordIdFilter(entry._id), restoreUpdate(entry)); } catch { rollbackFailures += 1; }
    }
    const suffix = rollbackFailures > 0 ? ` Otomatik geri almada ${rollbackFailures} hata oluştu; backup dosyasını kullanın: ${backupPath}` : " Uygulanan kayıtlar otomatik olarak geri alındı.";
    throw new Error(`${error instanceof Error ? error.message : String(error)}${suffix}`);
  }
  report.updated = updated;
  writeJsonAtomic(reportPath, { ...report, planned_changes: plans.slice(0, 1000) });
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nApply tamamlandı. Geri alma yedeği: ${backupPath}`);
}

async function runRollback(db, backupPath, options) {
  const backup = JSON.parse(readFileSync(resolve(backupPath), "utf8"));
  if (!Array.isArray(backup.records) || backup.collection !== "maintenance_records" || !Array.isArray(backup.tracked_fields) || !backup.tracked_fields.includes("group_id")) throw new Error("Backup dosyası beklenen grouped maintenance biçiminde değil.");
  if (backup.records.length > options.maxChanges) throw new Error(`Rollback sınırı aşıldı: ${backup.records.length} kayıt, --max-changes=${options.maxChanges}.`);
  const collection = db.collection("maintenance_records");
  let restored = 0;
  for (const entry of backup.records) {
    const result = await collection.updateOne(recordIdFilter(entry._id), restoreUpdate(entry));
    if (result.matchedCount !== 1) throw new Error(`Rollback kaydı bulunamadı: ${entry._id}`);
    restored += result.modifiedCount;
  }
  console.log(JSON.stringify({ mode: "rollback", backup: resolve(backupPath), requested: backup.records.length, restored }, null, 2));
}

async function main() {
  const { values, flags } = parseArgs(process.argv.slice(2));
  if (hasFlag(flags, "help")) return printHelp();
  const rollbackPath = readArg(values, "rollback");
  const apply = hasFlag(flags, "apply");
  const confirm = readArg(values, "confirm");
  if (apply && confirm !== (rollbackPath ? ROLLBACK_CONFIRM : APPLY_CONFIRM)) throw new Error(`Güvenlik onayı eksik veya hatalı. Beklenen: --confirm=${rollbackPath ? ROLLBACK_CONFIRM : APPLY_CONFIRM}`);
  if (!apply && rollbackPath) throw new Error("Rollback veritabanını değiştirir; --apply ve doğru --confirm birlikte verilmelidir.");
  loadEnvFile(resolve(".env.local"));
  const { client, db } = await connectDb();
  try {
    if (rollbackPath) await runRollback(db, rollbackPath, { maxChanges: Number(readArg(values, "max-changes", "1000")) });
    else await runMigration(db, { apply, reportPath: readArg(values, "report"), backupPath: readArg(values, "backup"), maxChanges: Number(readArg(values, "max-changes", "1000")) });
  } finally {
    await client.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(`Migration durduruldu: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
