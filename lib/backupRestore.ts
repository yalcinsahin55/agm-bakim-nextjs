import type { AnyBulkWriteOperation, ClientSession, Db } from "mongodb";
import { RESTORE_COLLECTIONS, cleanRestoredValue, type RestorableDocument } from "./backupFormat.ts";

export const RESTORE_BATCH_SIZE = 500;
export const MAX_RESTORE_DOCUMENTS_PER_COLLECTION = 50_000;

type RestoreCollectionsInput = Record<string, unknown>;

export interface RestorePlan {
  operationsByCollection: Map<(typeof RESTORE_COLLECTIONS)[number], AnyBulkWriteOperation<RestorableDocument>[]>;
  summary: Record<string, number>;
  skipped: Record<string, number>;
}

function getCollectionDocuments(collections: RestoreCollectionsInput, name: string): unknown[] {
  const documents = collections[name];
  return Array.isArray(documents) ? documents : [];
}

function isSafeRestoreIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && !/[.$\0]/.test(value);
}

export function buildRestorePlan(collections: RestoreCollectionsInput): RestorePlan {
  const operationsByCollection = new Map<(typeof RESTORE_COLLECTIONS)[number], AnyBulkWriteOperation<RestorableDocument>[]>();
  const summary: Record<string, number> = {};
  const skipped: Record<string, number> = {};

  for (const name of RESTORE_COLLECTIONS) {
    const documents = getCollectionDocuments(collections, name);
    if (documents.length > MAX_RESTORE_DOCUMENTS_PER_COLLECTION) {
      throw new RestorePlanError(`${name} koleksiyonu çok büyük.`, 413);
    }
    const operations: AnyBulkWriteOperation<RestorableDocument>[] = [];
    let count = 0;
    let skippedCount = 0;

    for (const raw of documents) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        skippedCount += 1;
        continue;
      }
      const document = cleanRestoredValue(raw) as RestorableDocument;
      const rawIdentity = document._id;
      const identity = isSafeRestoreIdentity(rawIdentity)
        ? rawIdentity
        : rawIdentity && typeof rawIdentity === "object" && "toHexString" in rawIdentity && typeof (rawIdentity as { toHexString?: unknown }).toHexString === "function"
          ? (rawIdentity as { toHexString: () => string }).toHexString()
          : null;
      if (identity) {
        delete document._id;
        const mongoIdentity = rawIdentity && typeof rawIdentity === "object" && "toHexString" in rawIdentity && typeof (rawIdentity as { toHexString?: unknown }).toHexString === "function"
          ? rawIdentity
          : identity;
        operations.push({
          updateOne: {
            filter: { _id: mongoIdentity },
            update: { $set: document, $setOnInsert: { _id: mongoIdentity } },
            upsert: true,
          },
        });
      } else {
        delete document._id;
        operations.push({ insertOne: { document } });
      }
      count += 1;
    }

    operationsByCollection.set(name, operations);
    summary[name] = count;
    skipped[name] = skippedCount;
  }

  return { operationsByCollection, summary, skipped };
}

export class RestorePlanError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RestorePlanError";
    this.status = status;
  }
}

export async function applyRestorePlanMerge(db: Db, plan: RestorePlan, session?: ClientSession): Promise<void> {
  for (const name of RESTORE_COLLECTIONS) {
    const operations = plan.operationsByCollection.get(name) || [];
    const collection = db.collection<RestorableDocument>(name);
    for (let offset = 0; offset < operations.length; offset += RESTORE_BATCH_SIZE) {
      await collection.bulkWrite(operations.slice(offset, offset + RESTORE_BATCH_SIZE), { ordered: true, ...(session ? { session } : {}) });
    }
  }
}

export async function applyRestorePlanTransaction(client: { startSession(): ClientSession }, db: Db, plan: RestorePlan): Promise<void> {
  const session = client.startSession();
  try {
    await session.withTransaction(() => applyRestorePlanMerge(db, plan, session));
  } finally {
    await session.endSession();
  }
}
