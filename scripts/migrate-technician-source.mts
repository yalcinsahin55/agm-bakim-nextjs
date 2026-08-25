#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { MongoClient, ObjectId, type Db, type Filter, type UpdateFilter } from "mongodb";

type JsonRecord = Record<string, unknown>;
type MongoId = string | ObjectId;
type MigrationRecord = { _id: MongoId; technician_source?: unknown; technician_id?: unknown; technician_name?: unknown; external_service_name?: unknown; [key: string]: unknown };
type MigrationUserDocument = { _id: MongoId; full_name?: unknown; role?: unknown; [key: string]: unknown };
type Technician = { id: string; full_name: string };
type ParsedArgs = { values: Record<string, string>; flags: Set<string> };
type CanonicalFields = { technician_source: "internal" | "external_service"; technician_id: string; technician_name: string; external_service_name?: string };
type MappingOverride = { source: "internal"; technician_id: string } | { source: "external_service"; external_service_name?: string };
type MappingFile = { records?: Record<string, MappingOverride> };
type Classification =
  | { action: "internal"; reason: string; fields: CanonicalFields; user: Technician }
  | { action: "external_service"; reason: string; fields: CanonicalFields }
  | { action: "unresolved"; reason: string; candidates?: Array<{ id: string; full_name: string }> };
type TrackedField = (typeof TRACKED_FIELDS)[number];
type FieldSnapshot = { present: boolean; value: unknown };
type BackupEntry = { _id: string; fields: Record<TrackedField, FieldSnapshot> };
type MigrationPlan = { _id: string; action: "internal" | "external_service"; reason: string; fields: CanonicalFields; before: Record<string, unknown>; user?: { id: string; full_name: string } };
type UnresolvedEntry = { _id: string; technician_id: unknown; technician_name: unknown; technician_source: unknown; reason: string; candidates: Array<{ id: string; full_name: string }> };
type MigrationReport = {
  tool: string; generated_at: string; mode: "dry-run" | "apply"; database: string; technician_users_found: number;
  scanned: number; high_confidence_changes: number; internal_changes: number; external_service_changes: number;
  unchanged: number; unresolved: number; unresolved_samples: UnresolvedEntry[]; unused_mapping_ids: string[];
  report_path: string; backup_path: string | null; safety: string; updated?: number; planned_changes?: MigrationPlan[];
};
type TechnicianBackup = { tool: string; created_at: string; database: string; collection: "maintenance_records"; tracked_fields: readonly TrackedField[]; count: number; records: BackupEntry[] };
type MigrationOptions = { apply: boolean; mappingPath: string; reportPath: string; backupPath: string; maxChanges: number };
type UnsetRecord = Record<string, "" | 1 | true>;

const EXTERNAL_SERVICE_TECHNICIAN_ID = "__external_service__";
const EXTERNAL_SERVICE_TECHNICIAN_NAME = "Dış Hizmet / Harici Servis";
const TECHNICIAN_ROLES = ["teknisyen", "planlamaci"] as const;
const CONFIRM_TOKEN = "APPLY-TECHNICIAN-SOURCE-MIGRATION";
const DEFAULT_OUTPUT_DIR = "migration-output";
const TRACKED_FIELDS = ["technician_source", "technician_id", "technician_name", "external_service_name"] as const;

function parseArgs(argv: readonly string[]): ParsedArgs {
  const values: Record<string, string> = {}; const flags = new Set<string>();
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const withoutPrefix = argument.slice(2); const separator = withoutPrefix.indexOf("=");
    if (separator === -1) flags.add(withoutPrefix); else values[withoutPrefix.slice(0, separator)] = withoutPrefix.slice(separator + 1);
  }
  return { values, flags };
}
function hasFlag(flags: ReadonlySet<string>, name: string): boolean { return flags.has(name); }
function readArg(values: Readonly<Record<string, string>>, name: string, fallback = ""): string { const value = values[name]; return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return; const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) { const trimmed = line.trim(); if (!trimmed || trimmed.startsWith("#")) continue; const separator = trimmed.indexOf("="); if (separator === -1) continue; const key = trimmed.slice(0, separator).trim(); let value = trimmed.slice(separator + 1).trim(); if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1); if (key && process.env[key] === undefined) process.env[key] = value; }
}
function asRecord(value: unknown): JsonRecord | null { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null; }
function normalizeTechnicianName(value: unknown): string { return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR") : ""; }
function isExternalRecord(record: MigrationRecord): boolean {
  const rawName = typeof record.technician_name === "string" ? record.technician_name.trim() : "";
  return record.technician_source === "external_service" || record.technician_id === EXTERNAL_SERVICE_TECHNICIAN_ID || Boolean(record.external_service_name) || rawName === EXTERNAL_SERVICE_TECHNICIAN_NAME || rawName.startsWith(`${EXTERNAL_SERVICE_TECHNICIAN_NAME} ·`);
}
function inferExternalServiceName(record: MigrationRecord): string {
  if (typeof record.external_service_name === "string" && record.external_service_name.trim()) return record.external_service_name.trim();
  const rawName = typeof record.technician_name === "string" ? record.technician_name.trim() : ""; const prefix = `${EXTERNAL_SERVICE_TECHNICIAN_NAME} ·`;
  return rawName.startsWith(prefix) ? rawName.slice(prefix.length).trim() : "";
}
function canonicalExternalFields(record: MigrationRecord, externalServiceName = inferExternalServiceName(record)): CanonicalFields {
  return { technician_source: "external_service", technician_id: EXTERNAL_SERVICE_TECHNICIAN_ID, technician_name: externalServiceName ? `${EXTERNAL_SERVICE_TECHNICIAN_NAME} · ${externalServiceName}` : EXTERNAL_SERVICE_TECHNICIAN_NAME, ...(externalServiceName ? { external_service_name: externalServiceName } : {}) };
}
function canonicalInternalFields(technician: Technician): CanonicalFields { return { technician_source: "internal", technician_id: technician.id, technician_name: technician.full_name }; }
function getRecordId(record: MigrationRecord): string { return record._id == null ? "" : String(record._id); }
function summarizeCurrentFields(record: MigrationRecord): Record<string, unknown> { const result: Record<string, unknown> = {}; for (const field of TRACKED_FIELDS) if (Object.prototype.hasOwnProperty.call(record, field)) result[field] = record[field]; return result; }
function fieldsEqual(record: MigrationRecord, nextFields: CanonicalFields): boolean { for (const field of TRACKED_FIELDS) { const currentPresent = Object.prototype.hasOwnProperty.call(record, field); const nextPresent = Object.prototype.hasOwnProperty.call(nextFields, field); if (currentPresent !== nextPresent) return false; if (currentPresent && String(record[field] ?? "") !== String(nextFields[field] ?? "")) return false; } return true; }
function isMappingOverride(value: unknown): value is MappingOverride {
  const candidate = asRecord(value); if (!candidate || (candidate.source !== "internal" && candidate.source !== "external_service")) return false;
  return candidate.source === "internal" ? typeof candidate.technician_id === "string" && Boolean(candidate.technician_id.trim()) : (candidate.external_service_name === undefined || typeof candidate.external_service_name === "string");
}
function resolveMapping(mapping: MappingFile, recordId: string): MappingOverride | undefined { const candidate = mapping.records?.[recordId]; return isMappingOverride(candidate) ? candidate : undefined; }
function resolveInternalUser(userId: unknown, usersById: ReadonlyMap<string, Technician>): Technician | undefined { if (typeof userId !== "string" || !userId.trim()) return undefined; return usersById.get(userId.trim()); }
function classifyRecord(record: MigrationRecord, usersById: ReadonlyMap<string, Technician>, usersByName: ReadonlyMap<string, Technician[]>, mapping: MappingFile): Classification {
  const override = resolveMapping(mapping, getRecordId(record));
  if (override) {
    if (override.source === "external_service") return { action: "external_service", reason: "mapping_override", fields: canonicalExternalFields(record, override.external_service_name) };
    const user = resolveInternalUser(override.technician_id, usersById); if (!user) return { action: "unresolved", reason: "mapping_user_not_found" };
    return { action: "internal", reason: "mapping_override", fields: canonicalInternalFields(user), user };
  }
  if (isExternalRecord(record)) return { action: "external_service", reason: "existing_external_marker", fields: canonicalExternalFields(record) };
  const rawId = typeof record.technician_id === "string" ? record.technician_id.trim() : ""; const byId = rawId ? usersById.get(rawId) : undefined;
  if (byId) return { action: "internal", reason: "technician_id_match", fields: canonicalInternalFields(byId), user: byId };
  const namesToTry = [record.technician_name, rawId].map(normalizeTechnicianName).filter(Boolean);
  for (const nameKey of [...new Set(namesToTry)]) {
    const matches = usersByName.get(nameKey) || [];
    if (matches.length === 1) return { action: "internal", reason: "normalized_name_match", fields: canonicalInternalFields(matches[0] as Technician), user: matches[0] as Technician };
    if (matches.length > 1) return { action: "unresolved", reason: "duplicate_normalized_name", candidates: matches.map((user) => ({ id: user.id, full_name: user.full_name })) };
  }
  return { action: "unresolved", reason: "no_user_match" };
}
function createUpdate(plan: MigrationPlan): UpdateFilter<MigrationRecord> {
  const $set: Record<string, unknown> = { ...plan.fields }; const $unset: UnsetRecord = {};
  if (plan.action === "internal") $unset.external_service_name = "";
  if (plan.action === "external_service" && !Object.prototype.hasOwnProperty.call(plan.fields, "external_service_name")) $unset.external_service_name = "";
  const update: UpdateFilter<MigrationRecord> = { $set };
  if (Object.keys($unset).length > 0) update.$unset = $unset;
  return update;
}
function makeOutputPath(explicitPath: string, prefix: string, timestamp: string): string { if (explicitPath) return resolve(explicitPath); mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true }); return resolve(DEFAULT_OUTPUT_DIR, `${prefix}-${timestamp}.json`); }
function writeJsonAtomic(filePath: string, value: unknown): void { mkdirSync(dirname(filePath), { recursive: true }); const temporaryPath = `${filePath}.tmp-${process.pid}`; writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8"); renameSync(temporaryPath, filePath); }
function makeBackupEntry(record: MigrationRecord): BackupEntry { const fields = {} as Record<TrackedField, FieldSnapshot>; for (const field of TRACKED_FIELDS) fields[field] = { present: Object.prototype.hasOwnProperty.call(record, field), value: record[field] }; return { _id: getRecordId(record), fields }; }
function restoreUpdate(entry: BackupEntry): UpdateFilter<MigrationRecord> {
  const $set: Record<string, unknown> = {}; const $unset: UnsetRecord = {};
  for (const field of TRACKED_FIELDS) { const snapshot = entry.fields[field]; if (!snapshot || snapshot.present !== true) $unset[field] = ""; else $set[field] = snapshot.value; }
  const update: UpdateFilter<MigrationRecord> = {}; if (Object.keys($set).length > 0) update.$set = $set; if (Object.keys($unset).length > 0) update.$unset = $unset; return update;
}
function printHelp(): void { console.log(`
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
}`); }
async function connectDb(): Promise<{ client: MongoClient; db: Db }> {
  loadEnvFile(resolve(".env.local")); const uri = process.env.MONGO_URI; if (!uri) throw new Error("MONGO_URI tanımlı değil. .env.local yükleyin veya ortam değişkeni olarak verin."); const client = new MongoClient(uri, { maxPoolSize: 4, serverSelectionTimeoutMS: 8000 }); await client.connect(); return { client, db: client.db(process.env.MONGO_DB_NAME || "agm_bakim") };
}
async function loadMapping(mappingPath: string): Promise<MappingFile> {
  if (!mappingPath) return {};
  const parsed: unknown = JSON.parse(readFileSync(resolve(mappingPath), "utf8"));
  const candidate = asRecord(parsed);
  if (!candidate) throw new Error("Mapping dosyası beklenen JSON biçiminde değil.");
  const recordsObject = candidate.records === undefined ? undefined : asRecord(candidate.records);
  if (candidate.records !== undefined && (!recordsObject || !Object.values(recordsObject).every(isMappingOverride))) throw new Error("Mapping dosyası beklenen JSON biçiminde değil.");
  return { records: recordsObject ? recordsObject as Record<string, MappingOverride> : undefined };
}
async function loadTechnicians(db: Db): Promise<{ usersById: Map<string, Technician>; usersByName: Map<string, Technician[]>; count: number }> {
  const users = await db.collection<MigrationUserDocument>("users").find({ role: { $in: TECHNICIAN_ROLES }, active: { $ne: false }, approved: { $ne: false } }, { projection: { _id: 1, full_name: 1, role: 1 } }).toArray();
  const usersById = new Map<string, Technician>(); const usersByName = new Map<string, Technician[]>();
  for (const user of users) { if (user?._id == null || typeof user.full_name !== "string" || !user.full_name.trim()) continue; const technician: Technician = { id: String(user._id), full_name: user.full_name.trim() }; usersById.set(technician.id, technician); const nameKey = normalizeTechnicianName(technician.full_name); const matches = usersByName.get(nameKey) || []; matches.push(technician); usersByName.set(nameKey, matches); }
  return { usersById, usersByName, count: usersById.size };
}
async function runMigration(db: Db, options: MigrationOptions): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-"); const reportPath = makeOutputPath(options.reportPath, "technician-source-report", timestamp); const backupPath = makeOutputPath(options.backupPath, "technician-source-backup", timestamp);
  if (!Number.isInteger(options.maxChanges) || options.maxChanges < 1) throw new Error("--max-changes pozitif bir tam sayı olmalıdır.");
  const mapping = await loadMapping(options.mappingPath); const { usersById, usersByName, count: technicianCount } = await loadTechnicians(db); const plans: MigrationPlan[] = []; const unresolved: UnresolvedEntry[] = []; let scanned = 0; let unchanged = 0;
  const cursor = db.collection<MigrationRecord>("maintenance_records").find({}, { projection: { technician_source: 1, technician_id: 1, technician_name: 1, external_service_name: 1 } }).sort({ _id: 1 });
  for await (const record of cursor) {
    scanned += 1; const classification = classifyRecord(record, usersById, usersByName, mapping);
    if (classification.action === "unresolved") { unresolved.push({ _id: getRecordId(record), technician_id: record.technician_id ?? null, technician_name: record.technician_name ?? null, technician_source: record.technician_source ?? null, reason: classification.reason, candidates: classification.candidates || [] }); continue; }
    if (fieldsEqual(record, classification.fields)) { unchanged += 1; continue; }
    const technicianUser = classification.action === "internal" ? classification.user : undefined;
    plans.push({ _id: getRecordId(record), action: classification.action, reason: classification.reason, fields: classification.fields, before: summarizeCurrentFields(record), user: technicianUser ? { id: technicianUser.id, full_name: technicianUser.full_name } : undefined });
  }
  const internalChanges = plans.filter((plan) => plan.action === "internal").length; const externalChanges = plans.filter((plan) => plan.action === "external_service").length; const mappingRecordIds = new Set(Object.keys(mapping.records || {})); const plannedRecordIds = new Set(plans.map((plan) => plan._id)); const unusedMappings = [...mappingRecordIds].filter((id) => !plannedRecordIds.has(id) && !unresolved.some((entry) => entry._id === id));
  const report: MigrationReport = { tool: "migrate-technician-source", generated_at: new Date().toISOString(), mode: options.apply ? "apply" : "dry-run", database: process.env.MONGO_DB_NAME || "agm_bakim", technician_users_found: technicianCount, scanned, high_confidence_changes: plans.length, internal_changes: internalChanges, external_service_changes: externalChanges, unchanged, unresolved: unresolved.length, unresolved_samples: unresolved.slice(0, 100), unused_mapping_ids: unusedMappings.slice(0, 100), report_path: reportPath, backup_path: options.apply ? backupPath : null, safety: "Only technician_source, technician_id, technician_name and external_service_name are changed; ambiguous records are left untouched." };
  if (!options.apply) { writeJsonAtomic(reportPath, { ...report, planned_changes: plans.slice(0, 1000) }); console.log(JSON.stringify(report, null, 2)); console.log(`\nDry-run tamamlandı. Hiçbir kayıt değiştirilmedi. Ayrıntılı rapor: ${reportPath}`); return; }
  if (plans.length > options.maxChanges) throw new Error(`Güvenlik sınırı aşıldı: ${plans.length} değişiklik planlandı, --max-changes=${options.maxChanges}. Önce dry-run raporunu inceleyin veya daha yüksek sınır verin.`);
  const backup: TechnicianBackup = { tool: "migrate-technician-source", created_at: new Date().toISOString(), database: process.env.MONGO_DB_NAME || "agm_bakim", collection: "maintenance_records", tracked_fields: TRACKED_FIELDS, count: plans.length, records: [] }; const recordsCollection = db.collection<MigrationRecord>("maintenance_records");
  for (const plan of plans) { const projection = Object.fromEntries(TRACKED_FIELDS.map((field) => [field, 1])); const current = await recordsCollection.findOne(recordIdFilter(plan._id), { projection }); if (!current) throw new Error(`Apply öncesi kayıt bulunamadı: ${plan._id}. İşlem durduruldu.`); backup.records.push(makeBackupEntry(current)); }
  writeJsonAtomic(backupPath, backup); let updated = 0; const appliedBackups: BackupEntry[] = [];
  try { for (let index = 0; index < plans.length; index += 1) { const plan = plans[index]; if (!plan) continue; const result = await recordsCollection.updateOne(recordIdFilter(plan._id), createUpdate(plan)); if (result.matchedCount !== 1) throw new Error(`Kayıt güncellenemedi: ${plan._id}. Backup hazır: ${backupPath}`); const backupEntry = backup.records[index]; if (backupEntry) appliedBackups.push(backupEntry); updated += result.modifiedCount; } }
  catch (error) { let rollbackFailures = 0; for (const entry of appliedBackups) { try { await recordsCollection.updateOne(recordIdFilter(entry._id), restoreUpdate(entry)); } catch { rollbackFailures += 1; } } const suffix = rollbackFailures > 0 ? ` Otomatik geri alma sırasında ${rollbackFailures} hata oluştu; backup dosyasını manuel kullanın: ${backupPath}` : " Uygulanan kayıtlar otomatik olarak eski alanlarına geri alındı."; throw new Error(`${error instanceof Error ? error.message : String(error)}${suffix}`); }
  report.updated = updated; report.backup_path = backupPath; report.planned_changes = plans.slice(0, 1000); writeJsonAtomic(reportPath, report); console.log(JSON.stringify(report, null, 2)); console.log(`\nApply tamamlandı. Geri alma yedeği: ${backupPath}`);
}
function recordIdFilter(value: string): Filter<MigrationRecord> { if (!/^[0-9a-fA-F]{24}$/.test(value)) return { _id: value }; return { _id: { $in: [value, new ObjectId(value)] } }; }
function isFieldSnapshot(value: unknown): value is FieldSnapshot { const candidate = asRecord(value); return Boolean(candidate && typeof candidate.present === "boolean" && "value" in candidate); }
function isBackupEntry(value: unknown): value is BackupEntry { const candidate = asRecord(value); return Boolean(candidate && typeof candidate._id === "string" && asRecord(candidate.fields) && TRACKED_FIELDS.every((field) => isFieldSnapshot(asRecord(candidate.fields)?.[field]))); }
function isTechnicianBackup(value: unknown): value is TechnicianBackup { const candidate = asRecord(value); return Boolean(candidate && typeof candidate.tool === "string" && candidate.collection === "maintenance_records" && Array.isArray(candidate.records) && candidate.records.every(isBackupEntry) && Array.isArray(candidate.tracked_fields) && candidate.tracked_fields.length === TRACKED_FIELDS.length && candidate.tracked_fields.every((field) => TRACKED_FIELDS.includes(field as TrackedField))); }
async function runRollback(db: Db, backupPath: string, options: { maxChanges: number }): Promise<void> {
  const parsed: unknown = JSON.parse(readFileSync(resolve(backupPath), "utf8")); if (!isTechnicianBackup(parsed)) throw new Error("Backup dosyası beklenen maintenance_records biçiminde değil."); if (parsed.records.length > options.maxChanges) throw new Error(`Rollback sınırı aşıldı: ${parsed.records.length} kayıt, --max-changes=${options.maxChanges}.`);
  const collection = db.collection<MigrationRecord>("maintenance_records"); let restored = 0; for (const entry of parsed.records) { const result = await collection.updateOne(recordIdFilter(entry._id), restoreUpdate(entry)); if (result.matchedCount !== 1) throw new Error(`Rollback kaydı bulunamadı: ${entry._id}`); restored += result.modifiedCount; }
  console.log(JSON.stringify({ mode: "rollback", backup: resolve(backupPath), requested: parsed.records.length, restored }, null, 2));
}
async function main(): Promise<void> {
  const { values, flags } = parseArgs(process.argv.slice(2)); if (hasFlag(flags, "help")) return printHelp(); const rollbackPath = readArg(values, "rollback"); const apply = hasFlag(flags, "apply"); const confirm = readArg(values, "confirm"); const isRollback = Boolean(rollbackPath); const expectedConfirm = isRollback ? "ROLLBACK-TECHNICIAN-SOURCE-MIGRATION" : CONFIRM_TOKEN;
  if (apply && confirm !== expectedConfirm) throw new Error(`Güvenlik onayı eksik veya hatalı. Beklenen: --confirm=${expectedConfirm}`); if (!apply && isRollback) throw new Error("Rollback veritabanını değiştirir; --apply ve doğru --confirm birlikte verilmelidir.");
  loadEnvFile(resolve(".env.local")); const { client, db } = await connectDb(); try { const maxChanges = Number(readArg(values, "max-changes", "1000")); if (isRollback) await runRollback(db, rollbackPath, { maxChanges }); else await runMigration(db, { apply, mappingPath: readArg(values, "mapping"), reportPath: readArg(values, "report"), backupPath: readArg(values, "backup"), maxChanges }); } finally { await client.close(); }
}
export { classifyRecord, normalizeTechnicianName, isExternalRecord, inferExternalServiceName, recordIdFilter };
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) { main().catch((error: unknown) => { console.error(`Migration durduruldu: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }); }
