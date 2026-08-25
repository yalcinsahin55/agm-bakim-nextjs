import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { ObjectId, MongoClient } from "mongodb";
import { del, put } from "@vercel/blob";

const DEFAULT_OUTPUT_DIR = "migration-output";
const APPLY_CONFIRM = "APPLY-LEGACY-MEDIA-MIGRATION";
const ROLLBACK_CONFIRM = "ROLLBACK-LEGACY-MEDIA-MIGRATION";
const MAX_RECORDS = 10_000;
const DEFAULT_MAX_CHANGES = 100;
const MAX_RECORD_MEDIA_BYTES = 8 * 1024 * 1024;
const PHOTO_MIMES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

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

function readArg(values, name, fallback = "") {
  return typeof values[name] === "string" && values[name].trim() ? values[name].trim() : fallback;
}

function positiveInt(values, name, fallback) {
  const raw = readArg(values, name, "");
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`--${name} pozitif bir tam sayı olmalıdır.`);
  return value;
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, filePath);
}

function decodeBase64(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:([^;]+);base64,(.*)$/is);
  const mime = match?.[1]?.toLowerCase() || "application/octet-stream";
  const encoded = (match?.[2] || value).replace(/\s/g, "");
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return null;
  const buffer = Buffer.from(encoded, "base64");
  return buffer.length > 0 ? { mime, buffer, isDataUrl: Boolean(match) } : null;
}

function detectImageMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function detectVideoMime(buffer) {
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "AVI ") return "video/x-msvideo";
  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "OggS") return "video/ogg";
  return null;
}

function parsePhoto(value) {
  const parsed = decodeBase64(value);
  if (!parsed) return null;
  const mime = parsed.mime === "application/octet-stream" ? detectImageMime(parsed.buffer) : parsed.mime;
  if (!mime || !PHOTO_MIMES.has(mime)) return null;
  return { ...parsed, mime };
}

function parseVideo(value) {
  if (typeof value === "string") {
    const parsed = decodeBase64(value);
    if (!parsed) return null;
    const mime = parsed.mime === "application/octet-stream" ? detectVideoMime(parsed.buffer) : parsed.mime;
    if (!mime || !mime.startsWith("video/")) return null;
    return { ...parsed, mime, filename: "legacy-video.mp4" };
  }
  if (!value || typeof value !== "object" || typeof value.data_b64 !== "string") return null;
  const parsed = decodeBase64(value.data_b64);
  if (!parsed) throw new Error("Video data_b64 geçersiz base64 içeriyor.");
  const declaredMime = typeof value.mime === "string" ? value.mime.toLowerCase() : typeof value.content_type === "string" ? value.content_type.toLowerCase() : "";
  const mime = declaredMime || (parsed.mime !== "application/octet-stream" ? parsed.mime : detectVideoMime(parsed.buffer));
  if (!mime || !mime.startsWith("video/")) throw new Error("Video MIME türü doğrulanamadı; kayıt olduğu gibi bırakıldı.");
  const filename = typeof value.filename === "string" ? value.filename.replace(/[^\w.\-]+/g, "_") : "legacy-video.mp4";
  return { ...parsed, mime, filename };
}

function mediaCount(record) {
  const photos = Array.isArray(record.photos_b64) ? record.photos_b64.filter((value) => typeof value === "string") : [];
  const videos = Array.isArray(record.videos) ? record.videos.filter((value) => typeof value === "string" || (value && typeof value === "object" && typeof value.data_b64 === "string")) : [];
  return { photos: photos.length, videos: videos.length };
}

function serializeId(id) {
  if (id instanceof ObjectId) return { $oid: id.toHexString() };
  return { value: String(id) };
}

function formatId(id) {
  return id instanceof ObjectId ? { $oid: id.toHexString() } : { value: String(id) };
}

function recordFilter(id) {
  if (id instanceof ObjectId) return { _id: id };
  if (id && typeof id === "object" && typeof id.$oid === "string" && ObjectId.isValid(id.$oid)) return { _id: new ObjectId(id.$oid) };
  if (id && typeof id === "object" && typeof id.value === "string") return { _id: id.value };
  return { _id: id };
}

function buildRollbackState(record) {
  const fields = ["photos_b64", "photos", "videos"];
  const set = {};
  const unset = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(record, field)) set[field] = record[field];
    else unset[field] = "";
  }
  return { set, unset };
}

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.MEDIA_READ_WRITE_TOKEN || undefined;
}

function candidateQuery() {
  return {
    $or: [
      { photos_b64: { $exists: true } },
      { videos: { $elemMatch: { data_b64: { $exists: true } } } },
      { videos: { $elemMatch: { $regex: "^data:video/[^;]+;base64," } } },
      { videos: { $elemMatch: { $regex: "^[A-Za-z0-9+/\\s]{32,}={0,2}$" } } },
    ],
  };
}

function inspectRecord(record) {
  const photos = Array.isArray(record.photos_b64) ? record.photos_b64 : [];
  const videos = Array.isArray(record.videos) ? record.videos : [];
  let bytes = 0;
  let photoCandidates = 0;
  let videoCandidates = 0;
  let invalid = false;
  for (const value of photos) {
    const parsed = parsePhoto(value);
    if (!parsed) invalid = true;
    else {
      photoCandidates += 1;
      bytes += parsed.buffer.length;
    }
  }
  for (const value of videos) {
    if (typeof value === "string") {
      const parsed = parseVideo(value);
      if (!parsed) continue;
      videoCandidates += 1;
      bytes += parsed.buffer.length;
    } else if (value && typeof value === "object" && typeof value.data_b64 === "string") {
      try {
        const parsed = parseVideo(value);
        videoCandidates += 1;
        bytes += parsed.buffer.length;
      } catch {
        invalid = true;
      }
    }
  }
  if (bytes > MAX_RECORD_MEDIA_BYTES) invalid = true;
  return { bytes, photoCandidates, videoCandidates, invalid, eligible: !invalid && (photoCandidates + videoCandidates > 0) };
}

async function findCandidates(db) {
  return db.collection("maintenance_records").find(candidateQuery(), { projection: { _id: 1, engine_id: 1, type_key: 1, photos_b64: 1, photos: 1, videos: 1 } }).limit(MAX_RECORDS + 1).toArray();
}

async function scan(db) {
  const records = await findCandidates(db);
  const limited = records.length > MAX_RECORDS;
  const selected = limited ? records.slice(0, MAX_RECORDS) : records;
  const report = { version: 2, mode: "dry-run", generated_at: new Date().toISOString(), scanned: selected.length, limited, eligible: 0, invalid: 0, skipped: 0, total_bytes: 0, samples: [] };
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

async function cleanupBlobs(urls) {
  let deleted = 0;
  for (const url of urls) {
    try {
      await del(url, blobToken() ? { token: blobToken() } : undefined);
      deleted += 1;
    } catch {
      // Cleanup is best effort; the persisted backup/report remains the source of truth.
    }
  }
  return deleted;
}

async function migrateRecord(record, db, onBeforeCommit) {
  const token = blobToken();
  const uploadedUrls = [];
  const set = {};
  const unset = {};
  try {
    const existingPhotos = Array.isArray(record.photos) ? record.photos.filter((value) => typeof value === "string") : [];
    const photoUrls = [...existingPhotos];
    const photos = Array.isArray(record.photos_b64) ? record.photos_b64 : [];
    for (const [index, value] of photos.entries()) {
      const parsed = parsePhoto(value);
      if (!parsed) throw new Error(`Geçersiz veya desteklenmeyen fotoğraf formatı: ${String(record._id)}`);
      const extension = PHOTO_MIMES.get(parsed.mime) || "bin";
      const blob = await put(`legacy-media/${String(record._id)}/photo-${index}-${randomUUID()}.${extension}`, parsed.buffer, { access: "public", contentType: parsed.mime, ...(token ? { token } : {}) });
      photoUrls.push(blob.url);
      uploadedUrls.push(blob.url);
    }
    if (photos.length > 0) {
      set.photos = photoUrls;
      unset.photos_b64 = "";
    }

    const videos = Array.isArray(record.videos) ? record.videos : [];
    const videoRefs = [];
    let convertedVideo = false;
    for (const [index, value] of videos.entries()) {
      const parsed = parseVideo(value);
      if (!parsed) {
        videoRefs.push(value);
        continue;
      }
      const blob = await put(`legacy-media/${String(record._id)}/video-${index}-${randomUUID()}-${parsed.filename}`, parsed.buffer, { access: "public", contentType: parsed.mime, multipart: true, ...(token ? { token } : {}) });
      videoRefs.push({ url: blob.url, filename: parsed.filename, mime: parsed.mime });
      uploadedUrls.push(blob.url);
      convertedVideo = true;
    }
    if (convertedVideo) set.videos = videoRefs;

    if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) return null;
    const update = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;
    const pendingChange = { id: serializeId(record._id), uploadedUrls, before: buildRollbackState(record), state: "pending" };
    await onBeforeCommit(pendingChange);
    const result = await db.collection("maintenance_records").updateOne(recordFilter(record._id), update);
    if (result.modifiedCount !== 1) throw new Error(`Veritabanı kaydı güncellenmedi: ${String(record._id)}`);
    pendingChange.state = "committed";
    return pendingChange;
  } catch (error) {
    await cleanupBlobs(uploadedUrls);
    throw error;
  }
}

async function rollback(db, rollbackPath) {
  if (!existsSync(rollbackPath)) throw new Error(`Rollback dosyası bulunamadı: ${rollbackPath}`);
  const backup = JSON.parse(readFileSync(rollbackPath, "utf8"));
  if (!backup || backup.version !== 1 || !Array.isArray(backup.changes)) throw new Error("Geçersiz medya rollback dosyası.");
  let restored = 0;
  let deletedBlobs = 0;
  for (const change of backup.changes) {
    if (!change || !change.id || !change.before) continue;
    const set = change.before.set || {};
    const unset = change.before.unset || {};
    const update = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;
    const result = await db.collection("maintenance_records").updateOne(recordFilter(change.id), update);
    restored += result.modifiedCount;
    deletedBlobs += await cleanupBlobs(Array.isArray(change.uploadedUrls) ? change.uploadedUrls : []);
  }
  return { restored, requested: backup.changes.length, deletedBlobs };
}

async function main() {
  const { values, flags } = parseArgs(process.argv.slice(2));
  const outputDir = resolve(readArg(values, "output-dir", DEFAULT_OUTPUT_DIR));
  const reportPath = resolve(readArg(values, "report", `${outputDir}/legacy-media-preview.json`));
  const rollbackPath = readArg(values, "rollback");
  const isRollback = Boolean(rollbackPath);
  const isApply = flags.has("apply");
  const expectedConfirm = isRollback ? ROLLBACK_CONFIRM : APPLY_CONFIRM;
  if (isApply && readArg(values, "confirm") !== expectedConfirm) throw new Error(`Apply için --confirm=${expectedConfirm} gereklidir.`);
  if (isRollback && !isApply) throw new Error("Rollback yalnızca --apply ve doğru onay token’ı ile çalışır.");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI gerekli.");
  if (isApply && !rollbackPath && !readArg(values, "max-changes")) throw new Error("Apply için zorunlu güvenlik sınırı: --max-changes=<n>.");
  const maxChanges = positiveInt(values, "max-changes", DEFAULT_MAX_CHANGES);
  if (maxChanges > MAX_RECORDS) throw new Error(`--max-changes en fazla ${MAX_RECORDS} olabilir.`);

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
    const { report, records } = await scan(db);
    if (!isApply) {
      writeJsonAtomic(reportPath, { ...report, max_changes: maxChanges });
      console.log(JSON.stringify({ mode: "dry-run", report: reportPath, scanned: report.scanned, eligible: report.eligible, invalid: report.invalid, skipped: report.skipped, total_bytes: report.total_bytes, limited: report.limited, max_changes: maxChanges }, null, 2));
      return;
    }
    const applicable = records.filter((record) => inspectRecord(record).eligible);
    if (applicable.length > maxChanges) throw new Error(`Apply durduruldu: ${applicable.length} uygun kayıt bulundu, --max-changes=${maxChanges}. Dry-run raporunu inceleyip daha düşük bir parti seçin.`);
    const backupPath = resolve(readArg(values, "backup", `${outputDir}/legacy-media-backup.json`));
    const backup = { version: 1, generated_at: new Date().toISOString(), changes: [], errors: [] };
    const persistBackup = () => writeJsonAtomic(backupPath, backup);
    const persistBeforeCommit = async (change) => {
      backup.changes.push(change);
      persistBackup();
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
    writeJsonAtomic(reportPath, { ...report, mode: "apply", applied, pending, backup: backupPath, errors: backup.errors.length, max_changes: maxChanges });
    console.log(JSON.stringify({ mode: "apply", report: reportPath, backup: backupPath, applied, pending, errors: backup.errors.length, max_changes: maxChanges }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Legacy media migration failed");
  process.exitCode = 1;
});
