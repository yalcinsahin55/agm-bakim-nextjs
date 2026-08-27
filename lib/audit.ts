import type { Db } from "mongodb";
import type { ClientSession } from "mongodb";
import type { User } from "@/lib/types";
import { ensureAppIndexes } from "@/lib/dbIndexes";
import { auditLogsCollection } from "@/lib/dbCollections";
import { getCurrentRequestId } from "@/lib/performance";

export type AuditAction = "create" | "update" | "delete" | "login" | "export" | "upload";

export interface AuditInput {
  user: Pick<User, "_id" | "full_name" | "role">;
  action: AuditAction;
  entity: string;
  entityId?: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  session?: ClientSession;
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
  await ensureAppIndexes(db);
  const collection = auditLogsCollection(db);
  await collection.insertOne({
    user_id: input.user._id,
    user_name: input.user.full_name,
    user_role: input.user.role,
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId || null,
    summary: input.summary,
    ...(getCurrentRequestId() ? { request_id: getCurrentRequestId() } : {}),
    before: compact(input.before),
    after: compact(input.after),
    created_at: new Date(),
  }, input.session ? { session: input.session } : undefined);
}
