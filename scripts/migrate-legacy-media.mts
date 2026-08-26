#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { ObjectId, MongoClient, type Db, type Filter, type UpdateFilter } from "mongodb";
import { del, put } from "@vercel/blob";

type JsonRecord = Record<string, unknown>;
type MigrationRecord = { _id: string | ObjectId; photos_b64?: unknown; photos?: unknown; videos?: unknown; [key: string]: unknown };
type ParsedArgs = { values: Record<string, string>; flags: Set<string> };
type PhotoMime = "image/jpeg" | "image/png" | "image/webp";
type DecodedBase64 = { mime: string; buffer: Buffer; isDataUrl: boolean };
type ParsedPhoto = DecodedBase64 & { mime: PhotoMime };
type ParsedVideo = DecodedBase64 & { mime: string; filename: string };
type MediaInspection = { bytes: number; photoCandidates: number; videoCandidates: number; invalid: boolean; eligible: boolean };
type SerializedId = { $oid: string } | { value: string };
type UnsetRecord = Record<string, "" | 1 | true>;
type RollbackState = { set: JsonRecord; unset: UnsetRecord };
type PendingChange = { id: SerializedId; uploadedUrls: string[]; before: RollbackState; state: "pending" | "committed" };
type MediaBackup = { version: 1; generated_at: string; changes: PendingChange[]; errors: Array<{ id: SerializedId; error: string }> };
type DurableBackupItem = { _id: string; run_id: string; generated_at: string; change: PendingChange };
type MediaReport = { version: 2; mode: "dry-run" | "apply"; generated_at: string; scanned: number; limited: boolean; eligible: number; invalid: number; skipped: number; total_bytes: number; samples: Array<JsonRecord>; max_changes?: number };

type BlobVideoReference = { url: string; filename: string; mime: string };

const DEFAULT_OUTPUT_DIR = "migration-output";
const APPLY_CONFIRM = "APPLY-LEGACY-MEDIA-MIGRATION";
const ROLLBACK_CONFIRM = "ROLLBACK-LEGACY-MEDIA-MIGRATION";
const MAX_RECORDS = 10_000;
const DEFAULT_MAX_CHANGES = 100;
const MAX_RECORD_MEDIA_BYTES = 8 * 1024 * 1024;
const PHOTO_MIMES = new Map<PhotoMime, string>([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

function safeBlobSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "record";
}

function contentDigest(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 24);
}

function legacyBlobPath(recordId: string | ObjectId, kind: "photo" | "video", index: number, buffer: Buffer, extension: string): string {
  return `legacy-media/${safeBlobSegment(String(recordId))}/${kind}-${index}-${contentDigest(buffer)}.${extension}`;
}

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
function readArg(values: Readonly<Record<string, string>>, name: string, fallback = ""): string {
  const value = values[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function positiveInt(values: Readonly<Record<string, string>>, name: string, fallback: number): number {
  const raw = readArg(values, name, "");
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`--${name} pozitif bir tam sayı olmalıdır.`);
  return value;
}
function writeJsonAtomic(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, filePath);
}
function decodeBase64(value: unknown): DecodedBase64 | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:([^;]+);base64,(.*)$/is);
  const mime = match?.[1]?.toLowerCase() || "application/octet-stream";
  const encoded = (match?.[2] || value).replace(/\s/g, "");
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return null;
  const buffer = Buffer.from(encoded, "base64");
  return buffer.length > 0 ? { mime, buffer, isDataUrl: Boolean(match) } : null;
}
function detectImageMime(buffer: Buffer): PhotoMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}
function detectVideoMime(buffer: Buffer): string | null {
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "AVI ") return "video/x-msvideo";
  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "OggS") return "video/ogg";
  return null;
}
function parsePhoto(value: unknown): ParsedPhoto | null {
  const parsed = decodeBase64(value);
  if (!parsed) return null;
  const detected = parsed.mime === "application/octet-stream" ? detectImageMime(parsed.buffer) : parsed.mime;
  if (!detected || !PHOTO_MIMES.has(detected as PhotoMime)) return null;
  return { ...parsed, mime: detected as PhotoMime };
}
function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}
function parseVideo(value: unknown): ParsedVideo | null {
  if (typeof value === "string") {
    const parsed = decodeBase64(value);
    if (!parsed) return null;
    const mime = parsed.mime === "application/octet-stream" ? detectVideoMime(parsed.buffer) : parsed.mime;
    if (!mime || !mime.startsWith("video/")) return null;
    return { ...parsed, mime, filename: "legacy-video.mp4" };
  }
  const candidate = asRecord(value);
  if (!candidate || typeof candidate.data_b64 !== "string") return null;
  const parsed = decodeBase64(candidate.data_b64);
  if (!parsed) throw new Error("Video data_b64 geçersiz base64 içeriyor.");
  const declaredMime = typeof candidate.mime === "string" ? candidate.mime.toLowerCase() : typeof candidate.content_type === "string" ? candidate.content_type.toLowerCase() : "";
  const mime = declaredMime || (parsed.mime !== "application/octet-stream" ? parsed.mime : detectVideoMime(parsed.buffer));
  if (!mime || !mime.startsWith("video/")) throw new Error("Video MIME türü doğrulanamadı; kayıt olduğu gibi bırakıldı.");
  const filename = typeof candidate.filename === "string" ? candidate.filename.replace(/[^\w.\-]+/g, "_") : "legacy-video.mp4";
  return { ...parsed, mime, filename };
}
function mediaCount(record: MigrationRecord): { photos: number; videos: number } {
  const photos = Array.isArray(record.photos_b64) ? record.photos_b64.filter((value) => typeof value === "string") : [];
  const videos = Array.isArray(record.videos) ? record.videos.filter((value) => typeof value === "string" || Boolean(asRecord(value)?.data_b64 && typeof asRecord(value)?.data_b64 === "string")) : [];
  return { photos: photos.length, videos: videos.length };
}
function serializeId(id: string | ObjectId): SerializedId {
  return id instanceof ObjectId ? { $oid: id.toHexString() } : { value: String(id) };
}
function formatId(id: string | ObjectId): SerializedId { return serializeId(id); }
function recordFilter(id: unknown): Filter<MigrationRecord> {
  if (id instanceof ObjectId) return { _id: id };
  const candidate = asRecord(id);
  if (candidate && typeof candidate.$oid === "string" && ObjectId.isValid(candidate.$oid)) return { _id: new ObjectId(candidate.$oid) };
  if (candidate && typeof candidate.value === "string") return { _id: candidate.value };
  return { _id: id as string | ObjectId };
}
function buildRollbackState(record: MigrationRecord): RollbackState {
  const fields = ["photos_b64", "photos", "videos"];
  const set: JsonRecord = {};
  const unset: UnsetRecord = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(record, field)) set[field] = record[field];
    else unset[field] = "";
  }
  return { set, unset };
}
function blobToken(): string | undefined { return process.env.BLOB_READ_WRITE_TOKEN || process.env.MEDIA_READ_WRITE_TOKEN || undefined; }
function blobStoreId(): string | undefined { return process.env.BLOB_STORE_ID || process.env.MEDIA_STORE_ID || undefined; }
function candidateQuery(): Filter<MigrationRecord> {
  return {
    $or: [
      { photos_b64: { $exists: true } },
      { videos: { $elemMatch: { data_b64: { $exists: true } } } },
      { videos: { $elemMatch: { $regex: "^data:video/[^;]+;base64," } } },
      { videos: { $elemMatch: { $regex: "^[A-Za-z0-9+/\\s]{32,}={0,2}$" } } },
    ],
  } as Filter<MigrationRecord>;
}
function inspectRecord(record: MigrationRecord): MediaInspection {
  const photos = Array.isArray(record.photos_b64) ? record.photos_b64 : [];
  const videos = Array.isArray(record.videos) ? record.videos : [];
  let bytes = 0;
  let photoCandidates = 0;
  let videoCandidates = 0;
  let invalid = false;
  for (const value of photos) {
    const parsed = parsePhoto(value);
    if (!parsed) invalid = true;
    else { photoCandidates += 1; bytes += parsed.buffer.length; }
  }
  for (const value of videos) {
    try {
      const parsed = parseVideo(value);
      if (!parsed) continue;
      videoCandidates += 1;
      bytes += parsed.buffer.length;
    } catch { invalid = true; }
  }
  if (bytes > MAX_RECORD_MEDIA_BYTES) invalid = true;
  return { bytes, photoCandidates, videoCandidates, invalid, eligible: !invalid && (photoCandidates + videoCandidates > 0) };
}
async function findCandidates(db: Db): Promise<MigrationRecord[]> {
  return await db.collection<MigrationRecord>("maintenance_records").find(candidateQuery(), { projection: { _id: 1, engine_id: 1, type_key: 1, photos_b64: 1, photos: 1, videos: 1 } }).limit(MAX_RECORDS + 1).toArray();
}
async function scan(db: Db): Promise<{ report: MediaReport; records: MigrationRecord[] }> {
  const records = await findCandidates(db);
  const limited = records.length > MAX_RECORDS;
  const selected = limited ? records.slice(0, MAX_RECORDS) : records;
  const report: MediaReport = { version: 2, mode: "dry-run", generated_at: new Date().toISOString(), scanned: selected.length, limited, eligible: 0, invalid: 0, skipped: 0, total_bytes: 0, samples: [] };
  for (const record of selected) {
    const inspected = inspectRecord(record);
    if (inspected.eligible) report.eligible += 1;
    else if (inspected.invalid) report.invalid += 1;
    else report.skipped += 1;
    report.total_bytes += inspected.bytes;
    if (report.samples.length < 20 && (inspected.eligible || inspected.invalid)) report.samples.push({ id: formatId(record._id), ...mediaCount(record), ...inspected });
  }
  return { report, records: selected };
}
async function cleanupBlobs(urls: readonly string[]): Promise<number> {
  let deleted = 0;
  for (const url of urls) {
    try { await del(url, blobToken() ? { token: blobToken() } : undefined); deleted += 1; }
    catch { /* Persisted backup/report remains the source of truth. */ }
  }
  return deleted;
}
async function migrateRecord(record: MigrationRecord, db: Db, onBeforeCommit: (change: PendingChange) => Promise<void>): Promise<PendingChange | null> {
  const token = blobToken();
  const uploadedUrls: string[] = [];
  const set: JsonRecord = {};
  const unset: UnsetRecord = {};
  try {
    const existingPhotos = Array.isArray(record.photos) ? record.photos.filter((value): value is string => typeof value === "string") : [];
    const photoUrls = [...existingPhotos];
    const photos = Array.isArray(record.photos_b64) ? record.photos_b64 : [];
    for (const [index, value] of photos.entries()) {
      const parsed = parsePhoto(value);
      if (!parsed) throw new Error(`Geçersiz veya desteklenmeyen fotoğraf formatı: ${String(record._id)}`);
      const extension = PHOTO_MIMES.get(parsed.mime) || "bin";
      const blob = await put(legacyBlobPath(record._id, "photo", index, parsed.buffer, extension), parsed.buffer, { access: "public", contentType: parsed.mime, addRandomSuffix: false, allowOverwrite: true, ...(token ? { token } : {}), ...(blobStoreId() ? { storeId: blobStoreId() } : {}) });
      photoUrls.push(blob.url);
      uploadedUrls.push(blob.url);
    }
    if (photos.length > 0) { set.photos = photoUrls; unset.photos_b64 = ""; }
    const videos = Array.isArray(record.videos) ? record.videos : [];
    const videoRefs: Array<unknown> = [];
    let convertedVideo = false;
    for (const [index, value] of videos.entries()) {
      const parsed = parseVideo(value);
      if (!parsed) { videoRefs.push(value); continue; }
      const videoExtension = parsed.filename.split(".").pop()?.replace(/[^A-Za-z0-9]/g, "") || "mp4";
      const blob = await put(legacyBlobPath(record._id, "video", index, parsed.buffer, videoExtension), parsed.buffer, { access: "public", contentType: parsed.mime, multipart: true, addRandomSuffix: false, allowOverwrite: true, ...(token ? { token } : {}), ...(blobStoreId() ? { storeId: blobStoreId() } : {}) });
      const reference: BlobVideoReference = { url: blob.url, filename: parsed.filename, mime: parsed.mime };
      videoRefs.push(reference);
      uploadedUrls.push(blob.url);
      convertedVideo = true;
    }
    if (convertedVideo) set.videos = videoRefs;
    if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) return null;
    const update: UpdateFilter<MigrationRecord> = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;
    const pendingChange: PendingChange = { id: serializeId(record._id), uploadedUrls, before: buildRollbackState(record), state: "pending" };
    await onBeforeCommit(pendingChange);
    const result = await db.collection<MigrationRecord>("maintenance_records").updateOne(recordFilter(record._id), update);
    if (result.modifiedCount !== 1) throw new Error(`Veritabanı kaydı güncellenmedi: ${String(record._id)}`);
    pendingChange.state = "committed";
    return pendingChange;
  } catch (error) {
    await cleanupBlobs(uploadedUrls);
    throw error;
  }
}
function isPendingChange(value: unknown): value is PendingChange {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as JsonRecord;
  return Boolean(candidate.id && typeof candidate.id === "object" && Array.isArray(candidate.uploadedUrls) && candidate.uploadedUrls.every((item) => typeof item === "string") && candidate.before && typeof candidate.before === "object" && (candidate.state === "pending" || candidate.state === "committed"));
}
function isMediaBackup(value: unknown): value is MediaBackup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as JsonRecord;
  return candidate.version === 1 && typeof candidate.generated_at === "string" && Array.isArray(candidate.changes) && candidate.changes.every(isPendingChange) && Array.isArray(candidate.errors);
}
async function rollbackBackup(db: Db, backup: MediaBackup): Promise<{ restored: number; requested: number; deletedBlobs: number }> {
  let restored = 0;
  let deletedBlobs = 0;
  for (const change of backup.changes) {
    const set = change.before.set;
    const unset = change.before.unset;
    const update: UpdateFilter<MigrationRecord> = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;
    const result = await db.collection<MigrationRecord>("maintenance_records").updateOne(recordFilter(change.id), update);
    restored += result.modifiedCount;
    deletedBlobs += await cleanupBlobs(change.uploadedUrls);
  }
  return { restored, requested: backup.changes.length, deletedBlobs };
}
async function readRollbackBackup(db: Db, rollbackPath: string, rollbackRunId: string): Promise<MediaBackup> {
  if (rollbackPath) {
    if (!existsSync(rollbackPath)) throw new Error(`Rollback dosyası bulunamadı: ${rollbackPath}`);
    const parsed: unknown = JSON.parse(readFileSync(rollbackPath, "utf8"));
    if (!isMediaBackup(parsed)) throw new Error("Geçersiz medya rollback dosyası.");
    return parsed;
  }
  const items = await db.collection<DurableBackupItem>("legacy_media_migration_backup_items").find({ run_id: rollbackRunId }).sort({ _id: 1 }).toArray();
  if (items.length === 0) throw new Error(`Durable rollback kaydı bulunamadı: ${rollbackRunId}`);
  return { version: 1, generated_at: items[0]?.generated_at || new Date().toISOString(), changes: items.map((item) => item.change), errors: [] };
}
async function main(): Promise<void> {
  const { values, flags } = parseArgs(process.argv.slice(2));
  const outputDir = resolve(readArg(values, "output-dir", DEFAULT_OUTPUT_DIR));
  const reportPath = resolve(readArg(values, "report", `${outputDir}/legacy-media-preview.json`));
  const rollbackPath = readArg(values, "rollback");
  const rollbackRunId = readArg(values, "rollback-run-id");
  const isRollback = Boolean(rollbackPath || rollbackRunId);
  const isApply = flags.has("apply");
  const expectedConfirm = isRollback ? ROLLBACK_CONFIRM : APPLY_CONFIRM;
  if (isApply && readArg(values, "confirm") !== expectedConfirm) throw new Error(`Apply için --confirm=${expectedConfirm} gereklidir.`);
  if (isRollback && !isApply) throw new Error("Rollback yalnızca --apply ve doğru onay token’ı ile çalışır.");
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI gerekli.");
  if (isApply && !isRollback && !readArg(values, "max-changes")) throw new Error("Apply için zorunlu güvenlik sınırı: --max-changes=<n>.");
  if (isApply && !isRollback && !readArg(values, "run-id")) throw new Error("Apply için zorunlu idempotency kilidi: --run-id=<benzersiz-id>.");
  const maxChanges = positiveInt(values, "max-changes", DEFAULT_MAX_CHANGES);
  if (maxChanges > MAX_RECORDS) throw new Error(`--max-changes en fazla ${MAX_RECORDS} olabilir.`);
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(process.env.MONGO_DB_NAME || undefined);
    if (isRollback) {
      const backup = await readRollbackBackup(db, rollbackPath ? resolve(rollbackPath) : "", rollbackRunId);
      const result = await rollbackBackup(db, backup);
      writeJsonAtomic(reportPath, { mode: "rollback", generated_at: new Date().toISOString(), ...result });
      console.log(JSON.stringify({ mode: "rollback", report: reportPath, ...result }, null, 2));
      return;
    }
    const { report, records } = await scan(db);
    if (!isApply) {
      writeJsonAtomic(reportPath, { ...report, max_changes: maxChanges });
      console.log(JSON.stringify({ mode: "dry-run", report: reportPath, scanned: report.scanned, eligible: report.eligible, invalid: report.invalid, skipped: report.skipped, total_bytes: report.total_bytes, limited: report.limited, max_changes: maxChanges }, null, 2));
      return;
    }
    const eligibleRecords = records.filter((record) => inspectRecord(record).eligible);
    const applicable = eligibleRecords.slice(0, maxChanges);
    if (applicable.length === 0) throw new Error("Apply için uygun legacy medya kaydı bulunamadı.");
    const runId = readArg(values, "run-id");
    try {
      await db.collection<{ _id: string; kind: string; created_at: string; max_changes: number; candidate_count: number; status: string }>("legacy_media_migration_runs").insertOne({ _id: runId, kind: "legacy-media", created_at: new Date().toISOString(), max_changes: maxChanges, candidate_count: eligibleRecords.length, status: "started" });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new Error(`Migration run-id zaten kullanılmış: ${runId}`);
      throw error;
    }
    const backupPath = resolve(readArg(values, "backup", `${outputDir}/legacy-media-backup.json`));
    const backup: MediaBackup = { version: 1, generated_at: new Date().toISOString(), changes: [], errors: [] };
    const persistBackup = (): void => writeJsonAtomic(backupPath, backup);
    const persistBeforeCommit = async (change: PendingChange): Promise<void> => {
      backup.changes.push(change);
      persistBackup();
      await db.collection<DurableBackupItem>("legacy_media_migration_backup_items").insertOne({ _id: `${runId}:${backup.changes.length}`, run_id: runId, generated_at: backup.generated_at, change });
    };
    persistBackup();
    for (const record of applicable) {
      try {
        const migrated = await migrateRecord(record, db, persistBeforeCommit);
        if (migrated) persistBackup();
      } catch (error) {
        backup.errors.push({ id: formatId(record._id), error: error instanceof Error ? error.message : "unknown" });
        persistBackup();
        console.error(`Legacy medya taşınamadı: ${String(record._id)}`);
      }
    }
    writeJsonAtomic(backupPath, backup);
    const applied = backup.changes.filter((change) => change.state === "committed").length;
    const pending = backup.changes.filter((change) => change.state !== "committed").length;
    await db.collection<{ _id: string; status: string; finished_at: string; applied: number; pending: number; errors: number }>("legacy_media_migration_runs").updateOne({ _id: runId }, { $set: { status: pending === 0 && backup.errors.length === 0 ? "completed" : "completed_with_errors", finished_at: new Date().toISOString(), applied, pending, errors: backup.errors.length } });
    writeJsonAtomic(reportPath, { ...report, mode: "apply", applied, pending, backup: backupPath, errors: backup.errors.length, max_changes: maxChanges });
    console.log(JSON.stringify({ mode: "apply", report: reportPath, backup: backupPath, applied, pending, errors: backup.errors.length, max_changes: maxChanges }, null, 2));
  } finally {
    await client.close();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Legacy media migration failed");
  process.exitCode = 1;
});
