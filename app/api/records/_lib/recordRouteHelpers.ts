import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";

type RecordCursor = { createdAt: string; id: string };

export function decodeRecordCursor(value: string | null): RecordCursor | null {
  if (!value || value.length > 500) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<RecordCursor>;
    if (typeof decoded.createdAt !== "string" || typeof decoded.id !== "string" || decoded.id.length > 100) return null;
    const date = new Date(decoded.createdAt);
    if (!Number.isFinite(date.getTime()) || !ObjectId.isValid(decoded.id)) return null;
    return { createdAt: date.toISOString(), id: decoded.id };
  } catch {
    return null;
  }
}

export function encodeRecordCursor(record: { created_at?: Date | string; _id?: unknown }): string | null {
  if (!record.created_at || !record._id) return null;
  const date = new Date(record.created_at);
  if (!Number.isFinite(date.getTime())) return null;
  return Buffer.from(JSON.stringify({ createdAt: date.toISOString(), id: String(record._id) }), "utf8").toString("base64url");
}

export function parseDateOnly(value: string): Date | null {
  const [year, month, day] = value.split("-").map(Number);
  if (![year, month, day].every(Number.isInteger)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function buildExtraClientRequestId(baseId: string | undefined, typeKey: string): string | undefined {
  if (!baseId) return undefined;
  const raw = `${baseId}:extra:${typeKey}`;
  if (raw.length <= 100) return raw;
  const digest = createHash("sha256").update(raw).digest("hex").slice(0, 48);
  return `${baseId.slice(0, 24)}:extra:${digest}`;
}
