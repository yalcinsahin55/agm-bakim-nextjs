import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";

export type BackupJsonValue = null | boolean | number | string | BackupJsonValue[] | { [key: string]: BackupJsonValue };

export const BACKUP_COLLECTIONS = [
  "users",
  "engines",
  "maintenance_types",
  "maintenance_records",
  "oil_analyses",
  "notifications",
  "audit_logs",
] as const;

export const RESTORE_COLLECTIONS = ["engines", "maintenance_types", "maintenance_records", "oil_analyses"] as const;

const EXPORT_BLOCKED_KEYS = new Set(["password", "password_hash", "token", "VAPID_PRIVATE_KEY", "pdf_b64", "photos_b64", "data_b64"]);
const RESTORE_BLOCKED_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "VAPID_PRIVATE_KEY",
  "pdf_b64",
  "photos_b64",
  "data_b64",
  "__proto__",
  "prototype",
  "constructor",
]);

export type RestorableDocument = Record<string, unknown> & { _id?: string | ObjectId };

export const BACKUP_FORMAT_VERSION = 2;
export const BACKUP_ENVIRONMENT = "agm-bakim-nextjs";

export interface BackupIntegrity {
  algorithm: "sha256";
  value: string;
}

export function isProductionBackupEnvironment(): boolean {
  return (process.env.VERCEL_ENV || process.env.NODE_ENV) === "production";
}

export function validateBackupIntegrity(
  collections: unknown,
  integrity: unknown,
  required: boolean,
): { ok: true } | { ok: false; error: string } {
  if (integrity === undefined) {
    return required
      ? { ok: false, error: "Production geri yüklemesi için yedek checksum bilgisi zorunludur." }
      : { ok: true };
  }
  if (!integrity || typeof integrity !== "object" || Array.isArray(integrity)) {
    return { ok: false, error: "Geçersiz yedek bütünlük bilgisi." };
  }
  const integrityRecord = integrity as Record<string, unknown>;
  if (integrityRecord.algorithm !== "sha256" || typeof integrityRecord.value !== "string" || !/^[a-f0-9]{64}$/i.test(integrityRecord.value)) {
    return { ok: false, error: "Geçersiz yedek checksum bilgisi." };
  }
  if (computeBackupChecksum(collections) !== integrityRecord.value.toLowerCase()) {
    return { ok: false, error: "Yedek checksum doğrulaması başarısız." };
  }
  return { ok: true };
}

export function backupEnvironmentMetadata(): { app: string; node_env: "production" | "preview" | "development" | "test" | "unknown" } {
  const raw = process.env.VERCEL_ENV || process.env.NODE_ENV;
  const node_env = raw === "production" || raw === "preview" || raw === "development" || raw === "test" ? raw : "unknown";
  return { app: BACKUP_ENVIRONMENT, node_env };
}

export function computeBackupChecksum(value: unknown): string {
  const canonical = JSON.stringify(value);
  return createHash("sha256").update(canonical).digest("hex");
}

export function sanitizeBackupValue(value: unknown): BackupJsonValue {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizeBackupValue);
  if (!value || typeof value !== "object") return null;
  if ("toHexString" in value && typeof (value as { toHexString?: unknown }).toHexString === "function") {
    return { $oid: String((value as { toHexString: () => string }).toHexString()) };
  }
  const result: { [key: string]: BackupJsonValue } = {};
  for (const [key, item] of Object.entries(value)) {
    if (EXPORT_BLOCKED_KEYS.has(key)) continue;
    result[key] = sanitizeBackupValue(item);
  }
  return result;
}

export function cleanRestoredValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanRestoredValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length === 1 && typeof record.$oid === "string" && /^[a-f\d]{24}$/i.test(record.$oid)) return new ObjectId(record.$oid);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if (RESTORE_BLOCKED_KEYS.has(key) || key.startsWith("$") || key.includes(".")) continue;
    result[key] = cleanRestoredValue(item);
  }
  return result;
}

export function getRestoreIdentity(document: Record<string, unknown>): string | null {
  const id = document._id;
  if (typeof id === "string" && id.length > 0 && id.length <= 200 && !/[.$\0]/.test(id)) return id;
  if (id instanceof ObjectId) return id.toHexString();
  return null;
}
