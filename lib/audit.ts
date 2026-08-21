import type { Db } from "mongodb";
import type { User } from "@/lib/types";

export type AuditAction = "create" | "update" | "delete" | "login" | "export" | "upload";

export interface AuditInput {
  user: Pick<User, "_id" | "full_name" | "role">;
  action: AuditAction;
  entity: string;
  entityId?: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}

function compact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (["password", "password_hash", "token", "VAPID_PRIVATE_KEY", "pdf_b64", "photos_b64", "data_b64"].includes(key)) continue;
    result[key] = item;
  }
  return result;
}

export async function writeAuditLog(db: Db, input: AuditInput): Promise<void> {
  const collection = db.collection("audit_logs") as any;
  await collection.insertOne({
    user_id: input.user._id,
    user_name: input.user.full_name,
    user_role: input.user.role,
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId || null,
    summary: input.summary,
    before: compact(input.before),
    after: compact(input.after),
    created_at: new Date(),
  });
}

export async function ensureAuditIndexes(db: Db): Promise<void> {
  await Promise.all([
    (db.collection("audit_logs") as any).createIndex({ created_at: -1 }),
    (db.collection("audit_logs") as any).createIndex({ user_id: 1, created_at: -1 }),
    (db.collection("audit_logs") as any).createIndex({ entity: 1, entity_id: 1, created_at: -1 }),
  ]);
}
