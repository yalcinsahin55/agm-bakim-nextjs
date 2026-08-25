#!/usr/bin/env node
// @ts-nocheck

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { MongoClient, ObjectId } from "mongodb";

const EXTERNAL_SERVICE_TECHNICIAN_ID = "__external_service__";
const EXTERNAL_SERVICE_TECHNICIAN_NAME = "Dış Hizmet / Harici Servis";
const TECHNICIAN_ROLES = ["teknisyen", "planlamaci"];
const CONFIRM_TOKEN = "APPLY-TECHNICIAN-SOURCE-MIGRATION";
const DEFAULT_OUTPUT_DIR = "migration-output";
const TRACKED_FIELDS = ["technician_source", "technician_id", "technician_name", "external_service_name"];

function parseArgs(argv) {
  const values = {};
  const flags = new Set();
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const withoutPrefix = argument.slice(2);
    const separator = withoutPrefix.indexOf("=");
    if (separator === -1) flags.add(withoutPrefix);
    else values[withoutPrefix.slice(0, separator)] = withoutPrefix.slice(separator + 1);
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
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function normalizeTechnicianName(value) {
  return typeof value === "string"
    ? value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR")
    : "";
}

function isExternalRecord(record) {
  const rawName = typeof record.technician_name === "string" ? record.technician_name.trim() : "";
  return record.technician_source === "external_service"
    || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID
    || Boolean(record.external_service_name)
    || rawName === EXTERNAL_SERVICE_TECHNICIAN_NAME
    || rawName.startsWith(`${EXTERNAL_SERVICE_TECHNICIAN_NAME} ·`);
}

function inferExternalServiceName(record) {
  if (typeof record.external_service_name === "string" && record.external_service_name.trim()) {
    return record.external_service_name.trim();
  }
  const rawName = typeof record.technician_name === "string" ? record.technician_name.trim() : "";
  const prefix = `${EXTERNAL_SERVICE_TECHNICIAN_NAME} ·`;
  return rawName.startsWith(prefix) ? rawName.slice(prefix.length).trim() : "";
}

function canonicalExternalFields(record, externalServiceName = inferExternalServiceName(record)) {
  return {
    technician_source: "external_service",
    technician_id: EXTERNAL_SERVICE_TECHNICIAN_ID,
    technician_name: externalServiceName ? `${EXTERNAL_SERVICE_TECHNICIAN_NAME} · ${externalServiceName}` : EXTERNAL_SERVICE_TECHNICIAN_NAME,
    ...(externalServiceName ? { external_service_name: externalServiceName } : {}),
  };
}

function canonicalInternalFields(technician) {
  return {
    technician_source: "internal",
    technician_id: technician.id,
    technician_name: technician.full_name,
  };
}

function getRecordId(record) {
  return record?._id == null ? "" : String(record._id);
}

function summarizeCurrentFields(record) {
  const result = {};
  for (const field of TRACKED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) result[field] = record[field];
  }
  return result;
}

function fieldsEqual(record, nextFields) {
  for (const field of TRACKED_FIELDS) {
    const currentPresent = Object.prototype.hasOwnProperty.call(record, field);
    const nextPresent = Object.prototype.hasOwnProperty.call(nextFields, field);
    if (currentPresent !== nextPresent) return false;
    if (currentPresent && String(record[field] ?? "") !== String(nextFields[field] ?? "")) return false;
  }
  return true;
}

function resolveMapping(mapping, recordId) {
  const candidate = mapping && mapping.records && typeof mapping.records === "object" ? mapping.records[recordId] : undefined;
  return candidate && typeof candidate === "object" ? candidate : undefined;
}

function resolveInternalUser(userId, usersById) {
  if (typeof userId !== "string" || !userId.trim()) return undefined;
  return usersById.get(userId.trim());
}

function classifyRecord(record, usersById, usersByName, mapping) {
  const recordId = getRecordId(record);
  const override = resolveMapping(mapping, recordId);

  if (override) {
    if (override.source === "external_service") {
      return {
        action: "external_service",
        reason: "mapping_override",
        fields: canonicalExternalFields(record, typeof override.external_service_name === "string" ? override.external_service_name : inferExternalServiceName(record)),
      };
    }
    if (override.source === "internal") {
      const user = resolveInternalUser(override.technician_id, usersById);
      if (!user) return { action: "unresolved", reason: "mapping_user_not_found" };
      return { action: "internal", reason: "mapping_override", fields: canonicalInternalFields(user), user };
    }
    return { action: "unresolved", reason: "mapping_source_invalid" };
  }

  if (isExternalRecord(record)) {
    return { action: "external_service", reason: "existing_external_marker", fields: canonicalExternalFields(record) };
  }

  const rawId = typeof record.technician_id === "string" ? record.technician_id.trim() : "";
  const byId = rawId ? usersById.get(rawId) : undefined;
  if (byId) {
    return { action: "internal", reason: "technician_id_match", fields: canonicalInternalFields(byId), user: byId };
  }

  const namesToTry = [record.technician_name, rawId]
    .map(normalizeTechnicianName)
    .filter(Boolean);
  const uniqueNameKeys = [...new Set(namesToTry)];
  for (const nameKey of uniqueNameKeys) {
    const matches = usersByName.get(nameKey) || [];
    if (matches.length === 1) {
      return { action: "internal", reason: "normalized_name_match", fields: canonicalInternalFields(matches[0]), user: matches[0] };
    }
    if (matches.length > 1) {
      return { action: "unresolved", reason: "duplicate_normalized_name", candidates: matches.map((user) => ({ id: user.id, full_name: user.full_name })) };
    }
  }

  return { action: "unresolved", reason: "no_user_match" };
}

function createUpdate(plan) {
  const $set = { ...plan.fields };
  const $unset = {};
  if (plan.action === "internal") $unset.external_service_name = "";
  if (plan.action === "external_service" && !Object.prototype.hasOwnProperty.call(plan.fields, "external_service_name")) {
    $unset.external_service_name = "";
  }
  return Object.keys($unset).length > 0 ? { $set, $unset } : { $set };
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

function makeBackupEntry(record) {
  const fields = {};
  for (const field of TRACKED_FIELDS) {
    fields[field] = {
      present: Object.prototype.hasOwnProperty.call(record, field),
      value: record[field],
    };
  }
  return { _id: getRecordId(record), fields };
}

function restoreUpdate(entry) {
  const $set = {};
  const $unset = {};
  for (const field of TRACKED_FIELDS) {
    const snapshot = entry.fields?.[field];
    if (!snapshot || snapshot.present !== true) $unset[field] = "";
    else $set[field] = snapshot.value;
  }
  const update = {};
  if (Object.keys($set).length > 0) update.$set = $set;
  if (Object.keys($unset).length > 0) update.$unset = $unset;
  return update;
}

function printHelp() {
  console.log(`
Güvenli teknisyen kaynağı migration aracı

Varsayılan davranış dry-run'dır; hiçbir veritabanı kaydı değiştirilmez.

Kullanım:
  node scripts/migrate-technician-source.mts
  node scripts/migrate-technician-source.mts --report=migration-output/preview.json
  node scripts/migrate-technician-source.mts --mapping=migration-output/mapping.json --apply --confirm=${CONFIRM_TOKEN}
  node scripts/migrate-technician-source.mts --rollback=migration-output/backup.json --apply --confirm=ROLLBACK-TECHNICIAN-SOURCE-MIGRATION

Seçenekler:
  --apply                 Yüksek güvenli eşleşmeleri uygular. Tek başına yeterli değildir.
  --confirm=...           Apply için gereken açık onay metni.
  --mapping=PATH          Belirsiz kayıtlar için yönetici tarafından hazırlanmış JSON eşleştirme dosyası.
  --report=PATH           Dry-run/uygulama raporu için çıktı yolu.
  --backup=PATH           Apply modunda geri alma yedeği için çıktı yolu.
  --max-changes=N         Tek çalıştırmada uygulanabilecek kayıt üst sınırı (varsayılan: 1000).
  --rollback=PATH         Daha önce oluşturulan backup JSON dosyasındaki alanları geri yükler.
  --help                  Bu yardım metnini gösterir.

Mapping formatı:
{
  "records": {
    "<record_id>": { "source": "internal", "technician_id": "<user_id>" },
    "<record_id>": { "source": "external_service", "external_service_name": "Garanti Servisi" }
  }
}
`);
}

async function connectDb() {
  loadEnvFile(resolve(".env.local"));
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI tanımlı değil. .env.local yükleyin veya ortam değişkeni olarak verin.");
  const client = new MongoClient(process.env.MONGO_URI, {
    maxPoolSize: 4,
    serverSelectionTimeoutMS: 8000,
  });
  await client.connect();
  return { client, db: client.db(process.env.MONGO_DB_NAME || "agm_bakim") };
}

async function loadMapping(mappingPath) {
  if (!mappingPath) return {};
  const parsed = JSON.parse(readFileSync(resolve(mappingPath), "utf8"));
  if (!parsed || typeof parsed !== "object" || (parsed.records !== undefined && typeof parsed.records !== "object")) {
    throw new Error("Mapping dosyası beklenen JSON biçiminde değil.");
  }
  return parsed;
}

async function loadTechnicians(db) {
  const users = await db.collection("users").find(
    { role: { $in: TECHNICIAN_ROLES }, active: { $ne: false }, approved: { $ne: false } },
    { projection: { _id: 1, full_name: 1, role: 1 } },
  ).toArray();
  const usersById = new Map();
  const usersByName = new Map();
  for (const user of users) {
    if (user?._id == null || typeof user.full_name !== "string" || !user.full_name.trim()) continue;
    const technician = { id: String(user._id), full_name: user.full_name.trim() };
    usersById.set(technician.id, technician);
    const nameKey = normalizeTechnicianName(technician.full_name);
    const matches = usersByName.get(nameKey) || [];
    matches.push(technician);
    usersByName.set(nameKey, matches);
  }
  return { usersById, usersByName, count: usersById.size };
}

async function runMigration(db, options) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = makeOutputPath(options.reportPath, "technician-source-report", timestamp);
  const backupPath = makeOutputPath(options.backupPath, "technician-source-backup", timestamp);
  if (!Number.isInteger(options.maxChanges) || options.maxChanges < 1) {
    throw new Error("--max-changes pozitif bir tam sayı olmalıdır.");
  }
  const mapping = await loadMapping(options.mappingPath);
  const { usersById, usersByName, count: technicianCount } = await loadTechnicians(db);
  const plans = [];
  const unresolved = [];
  let scanned = 0;
  let unchanged = 0;
  const cursor = db.collection("maintenance_records").find(
    {},
    { projection: { technician_source: 1, technician_id: 1, technician_name: 1, external_service_name: 1 } },
  ).sort({ _id: 1 });

  for await (const record of cursor) {
    scanned += 1;
    const classification = classifyRecord(record, usersById, usersByName, mapping);
    if (classification.action === "unresolved") {
      unresolved.push({
        _id: getRecordId(record),
        technician_id: record.technician_id ?? null,
        technician_name: record.technician_name ?? null,
        technician_source: record.technician_source ?? null,
        reason: classification.reason,
        candidates: classification.candidates || [],
      });
      continue;
    }
    if (fieldsEqual(record, classification.fields)) {
      unchanged += 1;
      continue;
    }
    plans.push({
      _id: getRecordId(record),
      action: classification.action,
      reason: classification.reason,
      fields: classification.fields,
      before: summarizeCurrentFields(record),
      user: classification.user ? { id: classification.user.id, full_name: classification.user.full_name } : undefined,
    });
  }

  const internalChanges = plans.filter((plan) => plan.action === "internal").length;
  const externalChanges = plans.filter((plan) => plan.action === "external_service").length;
  const mappingRecordIds = new Set(Object.keys(mapping.records || {}));
  const plannedRecordIds = new Set(plans.map((plan) => plan._id));
  const unusedMappings = [...mappingRecordIds].filter((id) => !plannedRecordIds.has(id) && !unresolved.some((entry) => entry._id === id));
  const report = {
    tool: "migrate-technician-source",
    generated_at: new Date().toISOString(),
    mode: options.apply ? "apply" : "dry-run",
    database: process.env.MONGO_DB_NAME || "agm_bakim",
    technician_users_found: technicianCount,
    scanned,
    high_confidence_changes: plans.length,
    internal_changes: internalChanges,
    external_service_changes: externalChanges,
    unchanged,
    unresolved: unresolved.length,
    unresolved_samples: unresolved.slice(0, 100),
    unused_mapping_ids: unusedMappings.slice(0, 100),
    report_path: reportPath,
    backup_path: options.apply ? backupPath : null,
    safety: "Only technician_source, technician_id, technician_name and external_service_name are changed; ambiguous records are left untouched.",
  };

  if (!options.apply) {
    writeJsonAtomic(reportPath, { ...report, planned_changes: plans.slice(0, 1000) });
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nDry-run tamamlandı. Hiçbir kayıt değiştirilmedi. Ayrıntılı rapor: ${reportPath}`);
    return;
  }

  if (plans.length > options.maxChanges) {
    throw new Error(`Güvenlik sınırı aşıldı: ${plans.length} değişiklik planlandı, --max-changes=${options.maxChanges}. Önce dry-run raporunu inceleyin veya daha yüksek sınır verin.`);
  }

  const backup = {
    tool: "migrate-technician-source",
    created_at: new Date().toISOString(),
    database: process.env.MONGO_DB_NAME || "agm_bakim",
    collection: "maintenance_records",
    tracked_fields: TRACKED_FIELDS,
    count: plans.length,
    records: [],
  };

  const recordsCollection = db.collection("maintenance_records");
  for (const plan of plans) {
    const current = await recordsCollection.findOne(recordIdFilter(plan._id), { projection: { ...Object.fromEntries(TRACKED_FIELDS.map((field) => [field, 1])) } });
    if (!current) throw new Error(`Apply öncesi kayıt bulunamadı: ${plan._id}. İşlem durduruldu.`);
    backup.records.push(makeBackupEntry(current));
  }
  writeJsonAtomic(backupPath, backup);

  let updated = 0;
  const appliedBackups = [];
  try {
    for (let index = 0; index < plans.length; index += 1) {
      const plan = plans[index];
      const result = await recordsCollection.updateOne(recordIdFilter(plan._id), createUpdate(plan));
      if (result.matchedCount !== 1) throw new Error(`Kayıt güncellenemedi: ${plan._id}. Backup hazır: ${backupPath}`);
      appliedBackups.push(backup.records[index]);
      updated += result.modifiedCount;
    }
  } catch (error) {
    let rollbackFailures = 0;
    for (const entry of appliedBackups) {
      try {
        await recordsCollection.updateOne(recordIdFilter(entry._id), restoreUpdate(entry));
      } catch {
        rollbackFailures += 1;
      }
    }
    const suffix = rollbackFailures > 0
      ? ` Otomatik geri alma sırasında ${rollbackFailures} hata oluştu; backup dosyasını manuel kullanın: ${backupPath}`
      : " Uygulanan kayıtlar otomatik olarak eski alanlarına geri alındı.";
    throw new Error(`${error instanceof Error ? error.message : String(error)}${suffix}`);
  }

  report.updated = updated;
  report.backup_path = backupPath;
  writeJsonAtomic(reportPath, { ...report, planned_changes: plans.slice(0, 1000) });
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nApply tamamlandı. Geri alma yedeği: ${backupPath}`);
}

function recordIdFilter(value) {
  if (typeof value !== "string" || !/^[0-9a-fA-F]{24}$/.test(value)) return { _id: value };
  return { _id: { $in: [value, new ObjectId(value)] } };
}

async function runRollback(db, backupPath, options) {
  const backup = JSON.parse(readFileSync(resolve(backupPath), "utf8"));
  if (!Array.isArray(backup.records) || backup.collection !== "maintenance_records") {
    throw new Error("Backup dosyası beklenen maintenance_records biçiminde değil.");
  }
  if (backup.records.length > options.maxChanges) {
    throw new Error(`Rollback sınırı aşıldı: ${backup.records.length} kayıt, --max-changes=${options.maxChanges}.`);
  }
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
  const isRollback = Boolean(rollbackPath);
  const expectedConfirm = isRollback ? "ROLLBACK-TECHNICIAN-SOURCE-MIGRATION" : CONFIRM_TOKEN;
  if (apply && confirm !== expectedConfirm) {
    throw new Error(`Güvenlik onayı eksik veya hatalı. Beklenen: --confirm=${expectedConfirm}`);
  }
  if (!apply && isRollback) throw new Error("Rollback veritabanını değiştirir; --apply ve doğru --confirm birlikte verilmelidir.");

  loadEnvFile(resolve(".env.local"));
  const { client, db } = await connectDb();
  try {
    if (isRollback) {
      await runRollback(db, rollbackPath, { maxChanges: Number(readArg(values, "max-changes", "1000")) });
    } else {
      await runMigration(db, {
        apply,
        mappingPath: readArg(values, "mapping"),
        reportPath: readArg(values, "report"),
        backupPath: readArg(values, "backup"),
        maxChanges: Number(readArg(values, "max-changes", "1000")),
      });
    }
  } finally {
    await client.close();
  }
}

export { classifyRecord, normalizeTechnicianName, isExternalRecord, inferExternalServiceName, recordIdFilter };

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(`Migration durduruldu: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
