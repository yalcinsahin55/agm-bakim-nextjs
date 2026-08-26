import { del, put } from "@vercel/blob";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { MongoClient, ObjectId, type Db, type UpdateFilter } from "mongodb";
import { looksLikePdf, MAX_PDF_BYTES } from "../lib/pdfSecurity.ts";
import process from "node:process";

type OilAnalysisDocument = {
  _id?: ObjectId | string;
  engine_id: string;
  engine_name: string;
  analysis_date: Date | string;
  result?: string;
  note?: string;
  pdf_url?: string;
  pdf_b64?: string;
  pdf_filename?: string;
  uploaded_by?: string;
  uploaded_by_id?: string;
  created_at?: Date | string;
};

type JsonRecord = Record<string, unknown>;
type MigrationMode = "dry-run" | "apply" | "rollback";
type BeforeState = { set: JsonRecord; unset: Record<string, ""> };
type BackupChange = { id: string; before: BeforeState; uploadedUrls: string[]; state: "pending" | "committed" };
type OilBackup = { version: 1; migration: "legacy-oil-pdfs"; run_id: string; generated_at: string; changes: BackupChange[]; errors: Array<{ id: string; error: string }> };
type OilReport = {
  version: 1;
  migration: "legacy-oil-pdfs";
  mode: MigrationMode;
  generated_at: string;
  scanned: number;
  eligible: number;
  invalid: number;
  skipped: number;
  total_bytes: number;
  limited: boolean;
  max_changes: number;
  samples: Array<{ id: string; engine_id: string; engine_name: string; pdf_filename: string | null; bytes: number; sha256: string; reason?: string }>;
};
type InspectResult = { eligible: boolean; invalid: boolean; bytes: number; sha256: string; reason?: string; buffer?: Uint8Array };
type MigrationRun = { _id: string; migration: "legacy-oil-pdfs"; status: string; applied?: number; pending?: number; errors?: number; created_at: string; updated_at: string };

const MAX_RECORDS = 10_000;
const DEFAULT_MAX_CHANGES = 100;
const APPLY_CONFIRM = "APPLY-LEGACY-OIL-PDFS";
const ROLLBACK_CONFIRM = "ROLLBACK-LEGACY-OIL-PDFS";
const RUN_COLLECTION = "legacy_oil_pdf_migration_runs";
const BACKUP_COLLECTION = "legacy_oil_pdf_migration_backup_items";

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.MEDIA_READ_WRITE_TOKEN;
}
function blobStoreId(): string | undefined {
  return process.env.BLOB_STORE_ID || process.env.MEDIA_STORE_ID;
}
function formatId(id: ObjectId | string | undefined): string {
  return id instanceof ObjectId ? id.toHexString() : String(id || "");
}
function recordFilter(id: ObjectId | string): { _id: ObjectId | string } {
  return id instanceof ObjectId ? { _id: id } : ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
}
function positiveInt(values: Map<string, string>, key: string, fallback: number): number {
  const raw = values.get(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${key} pozitif bir tam sayı olmalıdır.`);
  return parsed;
}
function nonNegativeInt(values: Map<string, string>, key: string, fallback: number): number {
  const raw = values.get(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`--${key} negatif olmayan bir tam sayı olmalıdır.`);
  return parsed;
}
function parseArgs(args: readonly string[]): { values: Map<string, string>; flags: Set<string> } {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (const arg of args) {
    if (!arg.startsWith("--")) throw new Error(`Bilinmeyen argüman: ${arg}`);
    const separator = arg.indexOf("=");
    if (separator === -1) flags.add(arg.slice(2));
    else values.set(arg.slice(2, separator), arg.slice(separator + 1));
  }
  return { values, flags };
}
function readArg(values: Map<string, string>, key: string, fallback = ""): string {
  return values.get(key) || fallback;
}
function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, JSON.stringify(value, null, 2));
  renameSync(temporaryPath, path);
}
function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function decodePdf(value: string): { buffer: Uint8Array; sha256: string } | null {
  const base64 = value.replace(/^data:application\/pdf;base64,/i, "").replace(/\s+/g, "").trim();
  if (!base64 || base64.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;
  const buffer = new Uint8Array(Buffer.from(base64, "base64"));
  if (buffer.length === 0 || buffer.length > MAX_PDF_BYTES || !looksLikePdf(buffer)) return null;
  return { buffer, sha256: sha256(buffer) };
}
function inspectRecord(record: OilAnalysisDocument): InspectResult {
  if (typeof record.pdf_url === "string" && record.pdf_url.trim()) return { eligible: false, invalid: false, bytes: 0, sha256: "", reason: "existing_pdf_url" };
  if (typeof record.pdf_b64 !== "string" || record.pdf_b64.trim() === "") return { eligible: false, invalid: false, bytes: 0, sha256: "", reason: "empty_pdf_b64" };
  const decoded = decodePdf(record.pdf_b64);
  if (!decoded) return { eligible: false, invalid: true, bytes: 0, sha256: "", reason: "invalid_pdf" };
  return { eligible: true, invalid: false, bytes: decoded.buffer.length, sha256: decoded.sha256, buffer: decoded.buffer };
}
function candidateQuery(): JsonRecord {
  return { pdf_b64: { $exists: true, $type: "string" } };
}
async function findCandidates(db: Db): Promise<OilAnalysisDocument[]> {
  return await db.collection<OilAnalysisDocument>("oil_analyses").find(candidateQuery(), {
    projection: { _id: 1, engine_id: 1, engine_name: 1, analysis_date: 1, pdf_url: 1, pdf_b64: 1, pdf_filename: 1 },
  }).sort({ _id: 1 }).limit(MAX_RECORDS + 1).toArray();
}
async function scan(db: Db): Promise<{ report: OilReport; records: OilAnalysisDocument[] }> {
  const records = await findCandidates(db);
  const limited = records.length > MAX_RECORDS;
  const selected = limited ? records.slice(0, MAX_RECORDS) : records;
  const report: OilReport = {
    version: 1,
    migration: "legacy-oil-pdfs",
    mode: "dry-run",
    generated_at: new Date().toISOString(),
    scanned: selected.length,
    eligible: 0,
    invalid: 0,
    skipped: 0,
    total_bytes: 0,
    limited,
    max_changes: DEFAULT_MAX_CHANGES,
    samples: [],
  };
  for (const record of selected) {
    const inspected = inspectRecord(record);
    if (inspected.eligible) report.eligible += 1;
    else if (inspected.invalid) report.invalid += 1;
    else report.skipped += 1;
    report.total_bytes += inspected.bytes;
    if (report.samples.length < 20 && (inspected.eligible || inspected.invalid)) {
      report.samples.push({
        id: formatId(record._id),
        engine_id: record.engine_id,
        engine_name: record.engine_name,
        pdf_filename: record.pdf_filename || null,
        bytes: inspected.bytes,
        sha256: inspected.sha256,
        ...(inspected.reason ? { reason: inspected.reason } : {}),
      });
    }
  }
  return { report, records: selected };
}
function blobPath(record: OilAnalysisDocument, digest: string): string {
  const safeId = formatId(record._id).replace(/[^A-Za-z0-9_-]/g, "_");
  return `oil-analyses/legacy/${safeId}/pdf-${digest}.pdf`;
}
async function cleanupBlobs(urls: readonly string[]): Promise<number> {
  let deleted = 0;
  for (const url of urls) {
    try {
      const token = blobToken();
      const storeId = blobStoreId();
      await del(url, { ...(token ? { token } : {}), ...(storeId ? { storeId } : {}) });
      deleted += 1;
    } catch {
      // Backup and run records remain the source of truth if cleanup cannot complete.
    }
  }
  return deleted;
}
function buildRollbackState(record: OilAnalysisDocument, originalPdf: string): BeforeState {
  const set: JsonRecord = { pdf_b64: originalPdf };
  const unset: Record<string, ""> = {};
  if (typeof record.pdf_url === "string" && record.pdf_url) set.pdf_url = record.pdf_url;
  else unset.pdf_url = "";
  return { set, unset };
}
async function migrateRecord(record: OilAnalysisDocument, db: Db, persistBeforeCommit: (change: BackupChange) => Promise<void>): Promise<BackupChange | null> {
  const inspected = inspectRecord(record);
  if (!inspected.eligible || !inspected.buffer || typeof record.pdf_b64 !== "string") return null;
  const uploadedUrls: string[] = [];
  try {
    const token = blobToken();
    const storeId = blobStoreId();
    const blob = await put(blobPath(record, inspected.sha256), Buffer.from(inspected.buffer), {
      access: "private",
      contentType: "application/pdf",
      addRandomSuffix: false,
      allowOverwrite: true,
      ...(token ? { token } : {}),
      ...(storeId ? { storeId } : {}),
    });
    uploadedUrls.push(blob.url);
    const change: BackupChange = {
      id: formatId(record._id),
      before: buildRollbackState(record, record.pdf_b64),
      uploadedUrls,
      state: "pending",
    };
    await persistBeforeCommit(change);
    const update: UpdateFilter<OilAnalysisDocument> = { $set: { pdf_url: blob.url }, $unset: { pdf_b64: "" } };
    const result = await db.collection<OilAnalysisDocument>("oil_analyses").updateOne(recordFilter(record._id || ""), update);
    if (result.modifiedCount !== 1) throw new Error(`Veritabanı kaydı güncellenmedi: ${formatId(record._id)}`);
    change.state = "committed";
    return change;
  } catch (error) {
    await cleanupBlobs(uploadedUrls);
    throw error;
  }
}
function isBackup(value: unknown): value is OilBackup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as JsonRecord;
  return candidate.version === 1 && candidate.migration === "legacy-oil-pdfs" && typeof candidate.run_id === "string" && Array.isArray(candidate.changes) && Array.isArray(candidate.errors);
}
async function claimRun(db: Db, runId: string): Promise<void> {
  const now = new Date().toISOString();
  const result = await db.collection<MigrationRun>(RUN_COLLECTION).updateOne(
    { _id: runId },
    { $setOnInsert: { _id: runId, migration: "legacy-oil-pdfs", status: "running", created_at: now, updated_at: now } },
    { upsert: true },
  );
  if (result.upsertedCount !== 1) throw new Error(`Bu run-id daha önce kullanılmış veya hâlen çalışıyor: ${runId}`);
}
async function updateRun(db: Db, runId: string, status: string, applied: number, pending: number, errors: number): Promise<void> {
  await db.collection<MigrationRun>(RUN_COLLECTION).updateOne({ _id: runId }, { $set: { status, applied, pending, errors, updated_at: new Date().toISOString() } });
}
async function rollback(db: Db, rollbackPath: string): Promise<{ restored: number; requested: number; deletedBlobs: number }> {
  if (!existsSync(rollbackPath)) throw new Error(`Rollback dosyası bulunamadı: ${rollbackPath}`);
  const parsed: unknown = JSON.parse(readFileSync(rollbackPath, "utf8"));
  if (!isBackup(parsed)) throw new Error("Geçersiz oil-analysis PDF rollback dosyası.");
  let restored = 0;
  let deletedBlobs = 0;
  for (const change of parsed.changes) {
    const update: UpdateFilter<OilAnalysisDocument> = {};
    if (Object.keys(change.before.set).length > 0) update.$set = change.before.set as Partial<OilAnalysisDocument>;
    if (Object.keys(change.before.unset).length > 0) update.$unset = change.before.unset;
    const result = await db.collection<OilAnalysisDocument>("oil_analyses").updateOne(recordFilter(change.id), update);
    restored += result.modifiedCount;
    deletedBlobs += await cleanupBlobs(change.uploadedUrls);
  }
  await updateRun(db, parsed.run_id, "rolled_back", 0, 0, 0);
  return { restored, requested: parsed.changes.length, deletedBlobs };
}
async function main(): Promise<void> {
  const { values, flags } = parseArgs(process.argv.slice(2));
  const reportPath = resolve(readArg(values, "report", "/tmp/legacy-oil-pdfs-report.json"));
  const rollbackPath = readArg(values, "rollback");
  const isRollback = Boolean(rollbackPath);
  const isApply = flags.has("apply");
  const expectedConfirm = isRollback ? ROLLBACK_CONFIRM : APPLY_CONFIRM;
  if (isApply && readArg(values, "confirm") !== expectedConfirm) throw new Error(`Apply için --confirm=${expectedConfirm} gereklidir.`);
  if (isRollback && !isApply) throw new Error("Rollback yalnızca --apply ve doğru onay token’ı ile çalışır.");
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI gerekli.");
  const maxChanges = positiveInt(values, "max-changes", DEFAULT_MAX_CHANGES);
  const batchOffset = nonNegativeInt(values, "offset", 0);
  if (maxChanges > MAX_RECORDS) throw new Error(`--max-changes en fazla ${MAX_RECORDS} olabilir.`);
  if (isApply && !rollbackPath && !values.has("max-changes")) throw new Error("Apply için zorunlu güvenlik sınırı: --max-changes=<n>. ");
  if (isApply && !rollbackPath && !values.has("run-id")) throw new Error("Apply için zorunlu benzersiz sınır: --run-id=<id>. ");
  const client = new MongoClient(uri, { maxPoolSize: 4, serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  try {
    const db = client.db(process.env.MONGO_DB_NAME || undefined);
    if (isRollback) {
      const result = await rollback(db, resolve(rollbackPath));
      writeJsonAtomic(reportPath, { mode: "rollback", migration: "legacy-oil-pdfs", generated_at: new Date().toISOString(), ...result });
      console.log(JSON.stringify({ mode: "rollback", report: reportPath, ...result }, null, 2));
      return;
    }
    const { report, records } = await scan(db);
    report.max_changes = maxChanges;
    if (!isApply) {
      writeJsonAtomic(reportPath, report);
      console.log(JSON.stringify({ mode: "dry-run", migration: "legacy-oil-pdfs", report: reportPath, scanned: report.scanned, eligible: report.eligible, invalid: report.invalid, skipped: report.skipped, total_bytes: report.total_bytes, limited: report.limited, max_changes: maxChanges }, null, 2));
      return;
    }
    const eligibleCandidates = records.filter((record) => inspectRecord(record).eligible);
    if (report.limited) throw new Error("Apply durduruldu: tarama limiti aşıldı; kapsamı bölerek yeniden dry-run yapın.");
    if (batchOffset > eligibleCandidates.length) throw new Error(`Apply durduruldu: --offset=${batchOffset}, uygun kayıt sayısı=${eligibleCandidates.length}.`);
    const applicable = eligibleCandidates.slice(batchOffset, batchOffset + maxChanges);
    if (applicable.length === 0) throw new Error("Apply durduruldu: seçilen batch içinde uygun kayıt bulunamadı.");
    const runId = readArg(values, "run-id");
    const backupPath = resolve(readArg(values, "backup", "/tmp/legacy-oil-pdfs-backup.json"));
    await claimRun(db, runId);
    const backup: OilBackup = { version: 1, migration: "legacy-oil-pdfs", run_id: runId, generated_at: new Date().toISOString(), changes: [], errors: [] };
    const persistBackup = (): void => writeJsonAtomic(backupPath, backup);
    const persistBeforeCommit = async (change: BackupChange): Promise<void> => {
      backup.changes.push(change);
      persistBackup();
      await db.collection<{ _id: string }>(BACKUP_COLLECTION).replaceOne(
        { _id: `${runId}:${change.id}` },
        { _id: `${runId}:${change.id}`, run_id: runId, migration: "legacy-oil-pdfs", ...change, created_at: new Date().toISOString() },
        { upsert: true },
      );
    };
    persistBackup();
    for (const record of applicable) {
      try {
        const migrated = await migrateRecord(record, db, persistBeforeCommit);
        if (migrated) {
          const saved = backup.changes.find((change) => change.id === migrated.id);
          if (saved) saved.state = migrated.state;
          persistBackup();
          await db.collection<{ _id: string }>(BACKUP_COLLECTION).updateOne({ _id: `${runId}:${migrated.id}` }, { $set: { state: migrated.state, updated_at: new Date().toISOString() } });
        }
      } catch (error) {
        backup.errors.push({ id: formatId(record._id), error: error instanceof Error ? error.message : "unknown" });
        persistBackup();
      }
    }
    const applied = backup.changes.filter((change) => change.state === "committed").length;
    const pending = backup.changes.filter((change) => change.state !== "committed").length;
    await updateRun(db, runId, "completed", applied, pending, backup.errors.length);
    writeJsonAtomic(backupPath, backup);
    writeJsonAtomic(reportPath, { ...report, mode: "apply", run_id: runId, applied, pending, errors: backup.errors.length, backup: backupPath });
    console.log(JSON.stringify({ mode: "apply", migration: "legacy-oil-pdfs", report: reportPath, backup: backupPath, run_id: runId, applied, pending, errors: backup.errors.length, max_changes: maxChanges }, null, 2));
  } finally {
    await client.close();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Legacy oil-analysis PDF migration failed");
  process.exitCode = 1;
});
